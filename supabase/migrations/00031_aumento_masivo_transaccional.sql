-- ============================================================
-- Alto #7: aumento-masivo transaccional
--
-- Antes:
--   - POST insertaba historial y despues actualizaba cada servicio uno
--     por uno en un loop. Si fallaba a mitad, quedaba inconsistente.
--   - DELETE (reversion) usaba placeholder 0 en precios_*_anterior
--     del historial de reversion -> auditoria degradada.
--
-- Fix: 2 RPCs que hacen todo en UNA transaccion PostgreSQL.
-- Si falla cualquier paso, revierte automaticamente (ACID).
-- ============================================================

-- 1. Aplicar aumento porcentual atomicamente
CREATE OR REPLACE FUNCTION public.apply_bulk_price_change(
  p_pct numeric,
  p_changed_by text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  affected int;
BEGIN
  IF p_pct = 0 OR p_pct < -50 OR p_pct > 200 OR p_pct IS NULL THEN
    RAISE EXCEPTION 'Porcentaje invalido (%). Debe estar entre -50 y 200, distinto de 0.', p_pct;
  END IF;

  -- Bloquear servicios activos y aplicar todo en UNA transaccion
  WITH snapshot AS (
    SELECT id, precio_efectivo, precio_mercadopago
    FROM servicios
    WHERE activo = true
    FOR UPDATE
  ),
  historial AS (
    INSERT INTO precios_historial (
      servicio_id,
      precio_efectivo_anterior, precio_mercadopago_anterior,
      precio_efectivo_nuevo, precio_mercadopago_nuevo,
      porcentaje, motivo, changed_by
    )
    SELECT
      id,
      precio_efectivo, precio_mercadopago,
      round(precio_efectivo * (1 + p_pct / 100)),
      round(precio_mercadopago * (1 + p_pct / 100)),
      p_pct,
      format('Aumento masivo %s%%', p_pct),
      p_changed_by
    FROM snapshot
    RETURNING servicio_id, precio_efectivo_nuevo, precio_mercadopago_nuevo
  ),
  update_result AS (
    UPDATE servicios s SET
      precio_efectivo = h.precio_efectivo_nuevo,
      precio_mercadopago = h.precio_mercadopago_nuevo,
      updated_at = now()
    FROM historial h
    WHERE s.id = h.servicio_id
    RETURNING s.id
  )
  SELECT count(*) INTO affected FROM update_result;

  RETURN affected;
END;
$$;

-- 2. Revertir cambios desde una fecha, atomicamente y sin placeholders
CREATE OR REPLACE FUNCTION public.revert_price_changes(
  p_since timestamptz,
  p_changed_by text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  affected int;
BEGIN
  IF p_since IS NULL THEN
    RAISE EXCEPTION 'Falta el parametro since';
  END IF;

  -- Para cada servicio: tomar el 1er cambio en el rango (precio "anterior" mas viejo)
  -- y volver el servicio a ese valor. Registrar la reversion en el historial con
  -- los precios REALES antes de revertir (no placeholders).
  WITH primeros AS (
    SELECT DISTINCT ON (servicio_id)
      servicio_id,
      precio_efectivo_anterior,
      precio_mercadopago_anterior
    FROM precios_historial
    WHERE created_at >= p_since
    ORDER BY servicio_id, created_at ASC
  ),
  actuales AS (
    SELECT s.id, s.precio_efectivo, s.precio_mercadopago, p.precio_efectivo_anterior, p.precio_mercadopago_anterior
    FROM servicios s
    JOIN primeros p ON p.servicio_id = s.id
    FOR UPDATE OF s
  ),
  update_result AS (
    UPDATE servicios s SET
      precio_efectivo = a.precio_efectivo_anterior,
      precio_mercadopago = a.precio_mercadopago_anterior,
      updated_at = now()
    FROM actuales a
    WHERE s.id = a.id
    RETURNING s.id
  ),
  log_reversion AS (
    INSERT INTO precios_historial (
      servicio_id,
      precio_efectivo_anterior, precio_mercadopago_anterior,
      precio_efectivo_nuevo, precio_mercadopago_nuevo,
      porcentaje, motivo, changed_by
    )
    SELECT
      id,
      precio_efectivo, precio_mercadopago,          -- precios reales antes de revertir
      precio_efectivo_anterior, precio_mercadopago_anterior,
      NULL,
      format('Reversion de cambios desde %s', p_since),
      p_changed_by
    FROM actuales
    RETURNING servicio_id
  )
  SELECT count(*) INTO affected FROM update_result;

  RETURN affected;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_bulk_price_change(numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.revert_price_changes(timestamptz, text) TO service_role;

NOTIFY pgrst, 'reload schema';
