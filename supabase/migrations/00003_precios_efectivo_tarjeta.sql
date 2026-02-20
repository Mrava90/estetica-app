-- Renombrar precio actual a precio_efectivo y agregar precio_tarjeta
ALTER TABLE servicios RENAME COLUMN precio TO precio_efectivo;
ALTER TABLE servicios ADD COLUMN precio_tarjeta DECIMAL(10,2);

-- Copiar precio_efectivo a precio_tarjeta como valor inicial
UPDATE servicios SET precio_tarjeta = precio_efectivo;

-- Hacer precio_tarjeta NOT NULL despues del update
ALTER TABLE servicios ALTER COLUMN precio_tarjeta SET NOT NULL;

-- Agregar campo metodo_pago a citas para saber como pago
ALTER TABLE citas ADD COLUMN metodo_pago TEXT DEFAULT 'efectivo';
