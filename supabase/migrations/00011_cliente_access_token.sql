-- Token de acceso para que los clientes vean sus turnos sin crear usuarios Auth
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS access_token uuid,
  ADD COLUMN IF NOT EXISTS access_token_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_clientes_access_token ON clientes (access_token);
