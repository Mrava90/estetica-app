-- ============================================================
-- Fix HIGH: doble reserva concurrente del mismo cliente en profesionales
-- distintos. El lock del RPC anterior era solo por profesional; dos requests
-- paralelos (dos pestañas del mismo cliente) tomaban locks distintos y
-- ambas pasaban el chequeo pre-RPC → dos citas fisicamente incompatibles.
--
-- Fix: mover el chequeo de conflictos del cliente DENTRO del RPC y agregar
-- un segundo advisory lock por cliente_id. Los locks siempre se toman en
-- orden determinista (cliente primero, despues profesional) para evitar
-- deadlocks entre dos requests que compartan cliente y profesional.
--
-- Nueva firma agrega p_reprogramar_id para excluir la cita a reprogramar
-- del chequeo (sino "colisiona consigo misma").
-- ============================================================

-- Firma nueva: hay un parametro mas, entonces no puedo CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.reservar_cita_atomica(
  UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, NUMERIC, NUMERIC, UUID, TEXT, TEXT
);

CREATE FUNCTION public.reservar_cita_atomica(
  p_profesional_id UUID,
  p_cliente_id UUID,
  p_servicio_id UUID,
  p_fecha_inicio TIMESTAMPTZ,
  p_fecha_fin TIMESTAMPTZ,
  p_tolerancia_min INT DEFAULT 0,
  p_precio_cobrado NUMERIC DEFAULT NULL,
  p_precio_original NUMERIC DEFAULT NULL,
  p_promocion_id UUID DEFAULT NULL,
  p_origen TEXT DEFAULT 'online',
  p_status TEXT DEFAULT 'pendiente',
  p_reprogramar_id UUID DEFAULT NULL
) RETURNS TABLE (cita_id UUID, err TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_overlap_ms BIGINT;
  v_tolerancia_ms BIGINT;
  v_new_cita_id UUID;
  v_bloqueado BOOLEAN;
  v_cliente_ocupado BOOLEAN;
BEGIN
  -- ORDEN DE LOCKS DETERMINISTA: cliente primero, profesional despues.
  -- Si dos requests reservan (clienteA con profA) y (clienteA con profB) a la vez,
  -- ambas toman lock de clienteA primero, entonces serializan sobre el cliente.
  -- Sin esto, cada request tomaria su lock de profesional y ambas pasarian.
  PERFORM pg_advisory_xact_lock(hashtextextended('cliente:' || p_cliente_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('prof:' || p_profesional_id::text, 0));

  v_tolerancia_ms := GREATEST(0, COALESCE(p_tolerancia_min, 0)) * 60000;

  -- Chequeo 1: conflicto con OTROS turnos del mismo cliente (fisicamente
  -- no puede estar en dos servicios a la vez). Excluye la cita a reprogramar.
  SELECT EXISTS(
    SELECT 1 FROM citas
    WHERE cliente_id = p_cliente_id
      AND status IN ('pendiente', 'confirmada')
      AND fecha_inicio < p_fecha_fin
      AND fecha_fin > p_fecha_inicio
      AND (p_reprogramar_id IS NULL OR id <> p_reprogramar_id)
  ) INTO v_cliente_ocupado;

  IF v_cliente_ocupado THEN
    RETURN QUERY SELECT NULL::UUID, 'CLIENTE_OCUPADO'::TEXT;
    RETURN;
  END IF;

  -- Chequeo 2: overlap con turnos del profesional respetando tolerancia.
  SELECT COALESCE(SUM(
    GREATEST(0, EXTRACT(EPOCH FROM (
      LEAST(p_fecha_fin, fecha_fin) - GREATEST(p_fecha_inicio, fecha_inicio)
    )) * 1000)
  ), 0)::BIGINT INTO v_overlap_ms
  FROM citas
  WHERE profesional_id = p_profesional_id
    AND status IN ('pendiente', 'confirmada')
    AND fecha_inicio < p_fecha_fin
    AND fecha_fin > p_fecha_inicio
    AND (p_reprogramar_id IS NULL OR id <> p_reprogramar_id);

  IF v_overlap_ms > v_tolerancia_ms THEN
    RETURN QUERY SELECT NULL::UUID, 'HORARIO_OCUPADO'::TEXT;
    RETURN;
  END IF;

  -- Chequeo 3: bloqueos del profesional.
  SELECT EXISTS(
    SELECT 1 FROM bloqueos
    WHERE profesional_id = p_profesional_id
      AND fecha_inicio < p_fecha_fin
      AND fecha_fin > p_fecha_inicio
  ) INTO v_bloqueado;

  IF v_bloqueado THEN
    RETURN QUERY SELECT NULL::UUID, 'HORARIO_BLOQUEADO'::TEXT;
    RETURN;
  END IF;

  INSERT INTO citas (
    cliente_id, profesional_id, servicio_id,
    fecha_inicio, fecha_fin,
    precio_cobrado, precio_original, promocion_aplicada_id,
    origen, status
  ) VALUES (
    p_cliente_id, p_profesional_id, p_servicio_id,
    p_fecha_inicio, p_fecha_fin,
    p_precio_cobrado, p_precio_original, p_promocion_id,
    p_origen, p_status::appointment_status
  )
  RETURNING id INTO v_new_cita_id;

  RETURN QUERY SELECT v_new_cita_id, NULL::TEXT;
END;
$$;

-- Re-aplicar los permisos (F-001) sobre la nueva firma.
REVOKE ALL ON FUNCTION public.reservar_cita_atomica(
  UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, NUMERIC, NUMERIC, UUID, TEXT, TEXT, UUID
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reservar_cita_atomica(
  UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, NUMERIC, NUMERIC, UUID, TEXT, TEXT, UUID
) TO service_role;

NOTIFY pgrst, 'reload schema';
