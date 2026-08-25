-- Logs de ejecuciones de cron jobs para monitoreo y debug.
-- Cada cron registra su inicio, fin, estado y posibles errores.
CREATE TABLE cron_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cron_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',  -- 'running' | 'success' | 'error'
  duration_ms INTEGER,
  details JSONB,
  error_msg TEXT
);

CREATE INDEX idx_cron_logs_started_at ON cron_logs(started_at DESC);
CREATE INDEX idx_cron_logs_name_status ON cron_logs(cron_name, status, started_at DESC);

ALTER TABLE cron_logs ENABLE ROW LEVEL SECURITY;
-- Sin policies = solo admin client (service_role) accede
