-- Categoría de Monotributo cargada manualmente (override del padrón A13).
-- Cuando AFIP devuelve la categoría por padrón A13, se usa esa.
-- Si no la devuelve, se usa este valor manual.
ALTER TABLE configuracion ADD COLUMN categoria_monotributo_manual TEXT;
