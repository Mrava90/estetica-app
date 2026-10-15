-- Duracion que ocupa un servicio cuando el turno empieza en las ultimas 2 horas
-- de la jornada de la profesional (ver lib/disponibilidad: duracionSegunHorario).
-- Caso: el nail art dura 80-90 min, pero como ultimo turno siempre se estira.
-- NULL = sin regla, ocupa la duracion normal todo el dia.
-- Solo afecta la reserva online; los turnos cargados a mano no cambian.

ALTER TABLE servicios ADD COLUMN IF NOT EXISTS duracion_ultimo_turno_minutos INT
  CHECK (duracion_ultimo_turno_minutos IS NULL OR duracion_ultimo_turno_minutos >= 5);

COMMENT ON COLUMN servicios.duracion_ultimo_turno_minutos IS
  'Minutos que bloquea si el turno empieza en las ultimas 2 hs de la jornada. NULL = duracion normal.';

-- Pedido de Fabi (15/10/2026): nail art de 80-90 min → 120 al cierre.
UPDATE servicios SET duracion_ultimo_turno_minutos = 120
  WHERE nombre IN ('Soft Gel NailArt', 'Kapping gel Nail Art') AND duracion_ultimo_turno_minutos IS NULL;

NOTIFY pgrst, 'reload schema';
