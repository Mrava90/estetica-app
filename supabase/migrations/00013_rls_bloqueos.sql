-- Habilitar RLS en tabla bloqueos (creada manualmente en dashboard)
ALTER TABLE bloqueos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage bloqueos" ON bloqueos
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
