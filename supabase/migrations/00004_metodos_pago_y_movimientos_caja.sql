-- ============================================================
-- 1. Renombrar tarjeta → mercadopago en citas existentes
-- ============================================================
UPDATE citas SET metodo_pago = 'mercadopago' WHERE metodo_pago = 'tarjeta';

-- ============================================================
-- 2. Renombrar columna precio_tarjeta → precio_mercadopago
-- ============================================================
ALTER TABLE servicios RENAME COLUMN precio_tarjeta TO precio_mercadopago;

-- ============================================================
-- 3. Crear tabla movimientos_caja para movimientos manuales
-- ============================================================
CREATE TABLE movimientos_caja (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  monto DECIMAL(10,2) NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'efectivo' CHECK (tipo IN ('efectivo', 'mercadopago')),
  descripcion TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_movimientos_caja_fecha ON movimientos_caja(fecha);

-- ============================================================
-- 4. RLS para movimientos_caja
-- ============================================================
ALTER TABLE movimientos_caja ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff full access" ON movimientos_caja
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
