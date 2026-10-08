-- Novedades: avisos del admin al personal sobre cambios en el sistema.
-- Cada destinataria la ve UNA vez: al cerrarla se anota en novedades_vistas.
--
-- Sin policies a proposito: solo se accede por /api/novedades con la service
-- role (que valida admin para crear y el usuario logueado para leer).

CREATE TABLE IF NOT EXISTS novedades (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo        TEXT NOT NULL,
  cuerpo        TEXT NOT NULL,
  -- Emails de las destinatarias. NULL = todo el personal.
  destinatarios TEXT[],
  creado_por    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS novedades_vistas (
  novedad_id UUID NOT NULL REFERENCES novedades(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  email      TEXT,
  vista_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (novedad_id, user_id)
);

CREATE INDEX IF NOT EXISTS novedades_created_at_idx ON novedades (created_at DESC);

ALTER TABLE novedades ENABLE ROW LEVEL SECURITY;
ALTER TABLE novedades_vistas ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE novedades IS 'Avisos del admin al personal. Se muestran una sola vez por usuaria.';
COMMENT ON TABLE novedades_vistas IS 'Quien cerro cada novedad y cuando. Si hay fila, no se le vuelve a mostrar.';
