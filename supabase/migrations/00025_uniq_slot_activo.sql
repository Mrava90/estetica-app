-- Previene doble-booking del mismo (profesional_id, fecha_inicio) para citas activas.
-- Es un partial UNIQUE index: solo aplica a citas pendiente/confirmada.
-- Las canceladas y completadas pueden repetir slot sin problema.
--
-- Prerequisito: no debe haber duplicados existentes con status=pendiente|confirmada.
-- Los 7 duplicados históricos ya fueron cancelados antes de aplicar esta migración.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cita_slot_activa
  ON citas (profesional_id, fecha_inicio)
  WHERE status IN ('pendiente', 'confirmada') AND profesional_id IS NOT NULL;
