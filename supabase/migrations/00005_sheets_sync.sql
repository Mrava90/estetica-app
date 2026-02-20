-- ============================================================
-- 1. Agregar columna origen a movimientos_caja
-- ============================================================
ALTER TABLE movimientos_caja ADD COLUMN origen TEXT DEFAULT 'manual';

-- Marcar movimientos importados existentes
UPDATE movimientos_caja SET origen = 'importado'
WHERE descripcion LIKE 'Gasto local:%'
   OR descripcion LIKE 'Adelanto comisión:%'
   OR descripcion LIKE 'Gasto personal:%';

-- ============================================================
-- 2. Índices para borrado rápido durante sync
-- ============================================================
CREATE INDEX idx_citas_origen ON citas(origen);
CREATE INDEX idx_movimientos_origen ON movimientos_caja(origen);
