-- ============================================================
-- Alto #5: EXCLUDE constraint para prevenir solapamiento REAL
--
-- Antes:
--   uniq_cita_slot_activa solo prevenia colisiones EXACTAS de
--   (profesional_id, fecha_inicio). Si dos citas del mismo profesional
--   se pisaban parcialmente (14:00-15:00 vs 14:30-15:30) el index no
--   lo detectaba y quedaban solapadas.
--
-- Fix:
--   EXCLUDE constraint con GIST que rechaza a nivel DB cualquier cita
--   activa que se solape con otra activa del mismo profesional.
--   Atomico, sin race conditions posibles.
--
-- Prerequisito:
--   Marcar como completada las 57 citas pasadas que hoy solapan
--   (todos son turnos que ya sucedieron, la mayoria por warnings
--   aceptados por el staff en su momento). Sin esto la creacion del
--   constraint fallaria.
-- ============================================================

-- Paso 1: Extension GIST para btree types (necesaria para el EXCLUDE)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Paso 2: Limpiar solapamientos historicos
-- Marca como 'completada' todas las citas pendiente/confirmada con fecha_fin
-- pasada que esten involucradas en un solapamiento. Refleja realidad (ya
-- sucedieron). Solo toca las 57 problemas identificados.
WITH solapadas AS (
  SELECT DISTINCT a.id
  FROM citas a
  JOIN citas b ON b.profesional_id = a.profesional_id
    AND b.id <> a.id
    AND b.status IN ('pendiente','confirmada')
    AND tstzrange(a.fecha_inicio, a.fecha_fin, '[)') && tstzrange(b.fecha_inicio, b.fecha_fin, '[)')
  WHERE a.status IN ('pendiente','confirmada')
    AND a.profesional_id IS NOT NULL
    AND a.fecha_fin < now() - interval '1 hour'
)
UPDATE citas SET
  status = 'completada',
  updated_at = now()
WHERE id IN (SELECT id FROM solapadas);

-- Paso 3: Crear el EXCLUDE constraint
-- Si dos citas activas del mismo profesional solapan en tiempo, PG rechaza el INSERT/UPDATE
ALTER TABLE citas
  DROP CONSTRAINT IF EXISTS no_solapamiento_citas_activas;

ALTER TABLE citas
  ADD CONSTRAINT no_solapamiento_citas_activas
  EXCLUDE USING gist (
    profesional_id WITH =,
    tstzrange(fecha_inicio, fecha_fin, '[)') WITH &&
  )
  WHERE (status IN ('pendiente','confirmada') AND profesional_id IS NOT NULL);

-- Nota: el index viejo uniq_cita_slot_activa (00025) queda redundante pero
-- no hace daño; lo dejo por si algun dia una app rara depende de que exista.

NOTIFY pgrst, 'reload schema';
