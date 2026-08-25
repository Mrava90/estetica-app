-- Tolerancia en minutos para superposición de turnos.
-- Si un servicio termina dentro de los X minutos de una cita existente,
-- el slot se considera disponible (el profesional gestiona el overlap).
-- 0 = sin tolerancia (default).
-- Máx recomendado: 15 minutos.
ALTER TABLE profesionales ADD COLUMN tolerancia_solapamiento_min INTEGER NOT NULL DEFAULT 0
  CHECK (tolerancia_solapamiento_min >= 0 AND tolerancia_solapamiento_min <= 20);
