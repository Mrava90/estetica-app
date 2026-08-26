-- ============================================================
-- Fix reenganches persistentes: marcado por cliente, no por cita.
--
-- Problema:
--   El cron sync-sheets (6am diario) borra e re-inserta todas las
--   citas con origen='sheets' desde el 1 del mes. Cuando se marcaba
--   citas.reenganche_enviado=true, ese flag se perdia al dia siguiente
--   porque el id cambiaba -> el cliente reaparecia en el listado.
--
-- Fix:
--   Nueva tabla reenganches_enviados con PRIMARY KEY = cliente_id.
--   Guarda cuando se envio el ultimo WA y cual fue la ultima visita
--   del cliente en ese momento. Cuando el cliente vuelve (fecha_visita
--   mas nueva > ultima_visita_al_enviar), se puede volver a mandar.
--   La tabla NO se toca en la sync de sheets.
-- ============================================================

CREATE TABLE IF NOT EXISTS reenganches_enviados (
  cliente_id UUID PRIMARY KEY REFERENCES clientes(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultima_visita_al_enviar TIMESTAMPTZ NOT NULL,
  sent_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_reenganches_enviados_sent_at ON reenganches_enviados(sent_at DESC);

ALTER TABLE reenganches_enviados ENABLE ROW LEVEL SECURITY;

-- Solo staff/admin puede leer/insertar/borrar
DROP POLICY IF EXISTS "Staff can manage reenganches_enviados" ON reenganches_enviados;
CREATE POLICY "Staff can manage reenganches_enviados"
  ON reenganches_enviados FOR ALL TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

NOTIFY pgrst, 'reload schema';
