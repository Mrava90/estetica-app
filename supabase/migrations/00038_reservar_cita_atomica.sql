-- ============================================================
-- Fix HIGH #1: Reserva atomica con advisory lock por profesional.
--
-- Reemplaza el patron actual del booking (SELECT check + INSERT separados)
-- por una unica RPC transaccional que:
--   1. Toma pg_advisory_xact_lock(hash(profesional_id)) -> serializa reservas
--      concurrentes al mismo profesional; libera al terminar la tx.
--   2. Chequea overlap contra citas activas RESPETANDO la tolerancia por
--      profesional (unlike el EXCLUDE que droppeamos, este acepta solapa-
--      mientos hasta X minutos que son de negocio, no bug).
--   3. Chequea bloqueos manuales.
--   4. INSERT la cita.
-- Todo en una sola transaccion PostgreSQL: si falla algun paso, revierte.
--
-- Beneficio: dos reservas simultaneas para el mismo prof no pueden ambas
-- pasar el chequeo (el 2do queda esperando el lock). Se cierra la ventana
-- de race que tenia el codigo TS.
-- ============================================================

CREATE OR REPLACE FUNCTION public.reservar_cita_atomica(
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
  p_status TEXT DEFAULT 'pendiente'
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
BEGIN
  -- Serializa reservas concurrentes al mismo profesional durante esta tx.
  -- hashtextextended da un bigint estable de UUID como texto.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_profesional_id::text, 0));

  v_tolerancia_ms := GREATEST(0, COALESCE(p_tolerancia_min, 0)) * 60000;

  -- Suma overlap TOTAL (en ms) con todas las citas activas del mismo prof
  SELECT COALESCE(SUM(
    GREATEST(0, EXTRACT(EPOCH FROM (
      LEAST(p_fecha_fin, fecha_fin) - GREATEST(p_fecha_inicio, fecha_inicio)
    )) * 1000)
  ), 0)::BIGINT INTO v_overlap_ms
  FROM citas
  WHERE profesional_id = p_profesional_id
    AND status IN ('pendiente', 'confirmada')
    AND fecha_inicio < p_fecha_fin
    AND fecha_fin > p_fecha_inicio;

  IF v_overlap_ms > v_tolerancia_ms THEN
    RETURN QUERY SELECT NULL::UUID, 'HORARIO_OCUPADO'::TEXT;
    RETURN;
  END IF;

  -- Chequeo de bloqueos manuales del profesional
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

  -- INSERT dentro del mismo lock
  INSERT INTO citas (
    cliente_id, profesional_id, servicio_id,
    fecha_inicio, fecha_fin,
    precio_cobrado, precio_original, promocion_aplicada_id,
    origen, status
  ) VALUES (
    p_cliente_id, p_profesional_id, p_servicio_id,
    p_fecha_inicio, p_fecha_fin,
    p_precio_cobrado, p_precio_original, p_promocion_id,
    p_origen, p_status
  )
  RETURNING id INTO v_new_cita_id;

  RETURN QUERY SELECT v_new_cita_id, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reservar_cita_atomica(
  UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, NUMERIC, NUMERIC, UUID, TEXT, TEXT
) TO service_role;

NOTIFY pgrst, 'reload schema';
