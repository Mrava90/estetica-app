-- Snapshot del padrón AFIP (WS_SR_PADRON_A13)
-- Cada consulta semanal se guarda como una fila nueva para tener histórico.
CREATE TABLE afip_padron_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cuit TEXT NOT NULL,
  estado_clave TEXT,
  tipo_persona TEXT,
  razon_social TEXT,
  nombre TEXT,
  apellido TEXT,
  categoria_monotributo TEXT,
  categoria_id INTEGER,
  impuestos JSONB,
  actividades JSONB,
  domicilios JSONB,
  raw_response JSONB,
  cambio_categoria_desde TEXT
);

CREATE INDEX idx_afip_padron_snapshot_consultado_at ON afip_padron_snapshot(consultado_at DESC);

ALTER TABLE afip_padron_snapshot ENABLE ROW LEVEL SECURITY;
-- Sin policies, solo service_role accede vía admin client
