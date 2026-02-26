-- Tabla para facturas electrónicas (integración ARCA/AFIP)
CREATE TABLE facturas (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  cita_id           UUID        REFERENCES citas(id) ON DELETE SET NULL,
  cliente_id        UUID        REFERENCES clientes(id) ON DELETE SET NULL,
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
  estado            TEXT        NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'emitida', 'error')),
  error_msg         TEXT,
  datos_json        JSONB,       -- Respuesta completa de ARCA (para auditoría)

  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- Índices útiles
CREATE INDEX idx_facturas_cita_id  ON facturas(cita_id);
CREATE INDEX idx_facturas_fecha    ON facturas(fecha);
CREATE INDEX idx_facturas_estado   ON facturas(estado);

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
