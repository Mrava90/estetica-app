-- Cache del Ticket de Acceso (TA) de WSAA AFIP
-- WSAA emite un TA válido por 12h y rechaza nuevas autenticaciones mientras siga vigente.
CREATE TABLE afip_ta_cache (
  service TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  sign TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE afip_ta_cache ENABLE ROW LEVEL SECURITY;

-- Solo accesible vía service role (admin client) — sin policies para anon/authenticated
