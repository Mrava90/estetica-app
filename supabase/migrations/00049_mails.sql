-- Mails a clientas desde la app (promociones y mails predeterminados), por el
-- mismo Gmail de las notificaciones de turnos (GMAIL_USER).
--
-- Sin policies a proposito: solo se accede por /api/mails con la service role
-- (que valida admin), salvo la baja, que valida un enlace firmado.

CREATE TABLE IF NOT EXISTS mail_plantillas (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     TEXT NOT NULL,
  asunto     TEXT NOT NULL,
  -- Texto plano; {nombre} y {apellido} se reemplazan por los de la clienta.
  cuerpo     TEXT NOT NULL,
  -- Opcional: el mail lleva la imagen (cartel) de esa promocion y un boton para reservar.
  promocion_id UUID REFERENCES promociones(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mail_envios (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plantilla_id UUID REFERENCES mail_plantillas(id) ON DELETE SET NULL,
  asunto       TEXT NOT NULL,
  cliente_id   UUID REFERENCES clientes(id) ON DELETE SET NULL,
  email        TEXT NOT NULL,
  ok           BOOLEAN NOT NULL,
  error        TEXT,
  enviado_por  UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mail_envios_created_at_idx ON mail_envios (created_at DESC);
CREATE INDEX IF NOT EXISTS mail_envios_cliente_idx ON mail_envios (cliente_id, plantilla_id, created_at DESC);

-- Baja de promociones: con fecha, la app no le vuelve a mandar mails masivos.
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS mail_baja_at TIMESTAMPTZ;

ALTER TABLE mail_plantillas ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_envios ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE mail_plantillas IS 'Mails predeterminados que el admin manda a clientas desde Clientes > Mails.';
COMMENT ON TABLE mail_envios IS 'Un registro por mail mandado (o fallido). Sirve de historial y para no repetir la misma plantilla en 7 dias.';
COMMENT ON COLUMN clientes.mail_baja_at IS 'Cuando la clienta se dio de baja de los mails. NULL = recibe.';
