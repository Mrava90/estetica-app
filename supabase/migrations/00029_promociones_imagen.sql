-- Agrega imagen opcional a promociones + bucket público para las imágenes

ALTER TABLE promociones ADD COLUMN IF NOT EXISTS imagen_url TEXT;

-- Bucket público para imágenes de promociones (mismo patrón que profesionales-fotos)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('promociones-imagenes', 'promociones-imagenes', TRUE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO NOTHING;

-- Policy: cualquiera puede LEER (bucket público)
DROP POLICY IF EXISTS "Public read promociones-imagenes" ON storage.objects;
CREATE POLICY "Public read promociones-imagenes"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'promociones-imagenes');

-- Policy: usuarios autenticados pueden subir/actualizar/eliminar
DROP POLICY IF EXISTS "Auth upload promociones-imagenes" ON storage.objects;
CREATE POLICY "Auth upload promociones-imagenes"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'promociones-imagenes');

DROP POLICY IF EXISTS "Auth update promociones-imagenes" ON storage.objects;
CREATE POLICY "Auth update promociones-imagenes"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'promociones-imagenes');

DROP POLICY IF EXISTS "Auth delete promociones-imagenes" ON storage.objects;
CREATE POLICY "Auth delete promociones-imagenes"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'promociones-imagenes');
