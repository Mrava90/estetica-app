-- Tabla para facturas electrónicas (integración ARCA/AFIP)
CREATE TABLE facturas (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Origen: cita de la app (cita_id) o fila de la hoja "Afip" (afip_row_key)
  cita_id           UUID        REFERENCES citas(id) ON DELETE SET NULL,
  afip_row_key      TEXT,       -- Ej: "afip-12" (índice de fila en la hoja Afip)

  fecha             DATE        NOT NULL,
  monto             DECIMAL(10,2) NOT NULL,
  descripcion       TEXT,

  -- Datos del receptor (cliente)
  receptor_nombre   TEXT,
  receptor_dni      TEXT,        -- DNI o CUIT del cliente (opcional para montos bajos)
  receptor_email    TEXT,

  -- Datos del comprobante ARCA
  tipo_cbte         SMALLINT    NOT NULL DEFAULT 11,  -- 11=Factura C, 6=Factura B, 1=Factura A
  punto_venta       SMALLINT    NOT NULL DEFAULT 1,
  numero_cbte       INTEGER,                          -- Número asignado por ARCA
  cae               TEXT,                             -- Código de Autorización Electrónico (14 dígitos)
  cae_vencimiento   DATE,

  -- Estado
  --   pendiente  = en lista, aún no revisada
  --   excluida   = el admin la descartó (no facturar)
  --   emitida    = CAE obtenido de ARCA, con validez fiscal
  --   error      = intento fallido (ver error_msg)
  estado            TEXT        NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'excluida', 'emitida', 'error')),
  error_msg         TEXT,
  datos_json        JSONB,       -- Respuesta completa de ARCA (para auditoría)

  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- Índices útiles
CREATE INDEX idx_facturas_cita_id      ON facturas(cita_id);
CREATE INDEX idx_facturas_afip_row_key ON facturas(afip_row_key);
CREATE INDEX idx_facturas_fecha        ON facturas(fecha);
CREATE INDEX idx_facturas_estado       ON facturas(estado);

-- Una sola factura por fila de la hoja Afip
CREATE UNIQUE INDEX idx_facturas_afip_row_key_unique
  ON facturas(afip_row_key) WHERE afip_row_key IS NOT NULL;

-- RLS
ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "facturas_all" ON facturas
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_facturas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER facturas_updated_at
  BEFORE UPDATE ON facturas
  FOR EACH ROW EXECUTE FUNCTION update_facturas_updated_at();
