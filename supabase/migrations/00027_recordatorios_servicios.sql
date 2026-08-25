-- Recordatorio de "reenganche": WhatsApp a clientes que se atendieron hace ~21 días
-- y no volvieron. La ventana es 21-23 días.

-- 1. Flag por cita — se marca cuando se le envió el WA de reenganche.
--    Una vez marcada, la cita nunca vuelve a aparecer en el listado.
ALTER TABLE citas
  ADD COLUMN IF NOT EXISTS reenganche_enviado BOOLEAN NOT NULL DEFAULT FALSE;

-- Índice para acelerar la query (excluir enviadas + rango de fechas)
CREATE INDEX IF NOT EXISTS idx_citas_reenganche_pendientes
  ON citas (fecha_inicio)
  WHERE reenganche_enviado = FALSE AND status = 'completada';

-- 2. Template del mensaje configurable desde /configuracion.
--    Placeholders: {nombre} {apellido} {servicio} {fecha} {dias}
ALTER TABLE configuracion
  ADD COLUMN IF NOT EXISTS mensaje_reenganche TEXT
  DEFAULT '¡Hola {nombre}! Hace {dias} días te atendimos con {servicio}. ¿Te gustaría reservar tu próximo turno? 💅✨';
