-- ============================================================
-- Fix critico: RPC reservar_cita_atomica fallaba al insertar
-- por cast implicito.
--
-- Error: "column status is of type appointment_status but expression
-- is of type text". La columna citas.status es un ENUM, el parametro
-- p_status venia como TEXT y PostgreSQL no hace el cast automatico
-- dentro del INSERT. Todas las reservas nuevas quedaban con timeout
-- 500 desde el commit 7d77019 (el que introdujo la RPC).
--
-- Fix minimo: cast explicito p_status::appointment_status en el INSERT.
-- No cambia la firma publica (sigue aceptando p_status como TEXT).
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
  PERFORM pg_advisory_xact_lock(hashtextextended(p_profesional_id::text, 0));

  v_tolerancia_ms := GREATEST(0, COALESCE(p_tolerancia_min, 0)) * 60000;

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

NOTIFY pgrst, 'reload schema';
