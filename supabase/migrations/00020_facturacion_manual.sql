-- Ingresos manuales que no pasaron por AFIP (efectivo no facturado, ventas sueltas, etc).
-- Se suman al facturado total para calcular el semáforo de Monotributo.
CREATE TABLE facturacion_manual (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  monto NUMERIC(14, 2) NOT NULL CHECK (monto >= 0),
  nota TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

CREATE INDEX idx_facturacion_manual_fecha ON facturacion_manual(fecha DESC);

ALTER TABLE facturacion_manual ENABLE ROW LEVEL SECURITY;
-- Sin policies = solo admin client (service_role) accede
