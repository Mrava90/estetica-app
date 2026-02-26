-- Tabla para controlar qué páginas pueden ver los usuarios no administradores
CREATE TABLE IF NOT EXISTS nav_permisos (
  href TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  visible_no_admin BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insertar las páginas que no son admin-only (con sus valores por defecto)
INSERT INTO nav_permisos (href, label, visible_no_admin) VALUES
  ('/calendario',    'Calendario',    TRUE),
  ('/caja',          'Caja Diaria',   TRUE),
  ('/clientes',      'Clientes',      TRUE),
  ('/servicios',     'Servicios',     TRUE),
  ('/personal',      'Personal',      TRUE),
  ('/configuracion', 'Configuración', TRUE)
ON CONFLICT (href) DO NOTHING;

ALTER TABLE nav_permisos ENABLE ROW LEVEL SECURITY;

-- Todos los usuarios autenticados pueden leer
CREATE POLICY "nav_permisos_read" ON nav_permisos
  FOR SELECT TO authenticated USING (TRUE);

-- Solo el admin puede modificar
CREATE POLICY "nav_permisos_write" ON nav_permisos
  FOR ALL TO authenticated
  USING (auth.email() = 'ravamartin@gmail.com')
  WITH CHECK (auth.email() = 'ravamartin@gmail.com');
