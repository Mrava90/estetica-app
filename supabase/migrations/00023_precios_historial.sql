-- Historial de cambios de precios por servicio.
-- Permite revertir aumentos masivos y auditar quién hizo cada cambio.
CREATE TABLE precios_historial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id UUID NOT NULL REFERENCES servicios(id) ON DELETE CASCADE,
  precio_efectivo_anterior NUMERIC(14, 2) NOT NULL,
  precio_mercadopago_anterior NUMERIC(14, 2) NOT NULL,
  precio_efectivo_nuevo NUMERIC(14, 2) NOT NULL,
  precio_mercadopago_nuevo NUMERIC(14, 2) NOT NULL,
  porcentaje NUMERIC(6, 2),  -- si fue aumento por %, lo guardamos
  motivo TEXT,                -- "aumento masivo 15%", "edición manual", etc
  changed_by TEXT,            -- email del usuario que lo hizo
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_precios_historial_servicio ON precios_historial(servicio_id, created_at DESC);
CREATE INDEX idx_precios_historial_created_at ON precios_historial(created_at DESC);

ALTER TABLE precios_historial ENABLE ROW LEVEL SECURITY;
-- Solo staff autenticado puede ver el historial
CREATE POLICY "Staff can read precios_historial" ON precios_historial
  FOR SELECT TO authenticated USING (true);
-- Solo service_role (admin client) inserta
