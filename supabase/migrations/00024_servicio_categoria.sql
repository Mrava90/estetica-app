-- Categoría manual del servicio (override de la heurística por nombre).
-- Si está cargada, se usa esa. Si es null, fallback a getCategoria(nombre).
ALTER TABLE servicios
  ADD COLUMN categoria TEXT
  CHECK (categoria IN ('manos', 'pies', 'pestanas', 'cejas', 'otros') OR categoria IS NULL);
