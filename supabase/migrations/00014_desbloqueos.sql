-- Tabla para desbloqueos excepcionales (habilitar un día que normalmente no trabaja)
CREATE TABLE desbloqueos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profesional_id UUID NOT NULL REFERENCES profesionales(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  motivo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profesional_id, fecha, hora_inicio)
);

ALTER TABLE desbloqueos ENABLE ROW LEVEL SECURITY;

-- Staff autenticado puede gestionar desbloqueos
CREATE POLICY "Staff can manage desbloqueos" ON desbloqueos
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Lectura pública para que la página de reservas los vea
CREATE POLICY "Public can read desbloqueos" ON desbloqueos
  FOR SELECT TO anon
  USING (true);
