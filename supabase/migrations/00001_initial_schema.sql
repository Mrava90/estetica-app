-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE appointment_status AS ENUM ('pendiente', 'confirmada', 'completada', 'cancelada', 'no_asistio');
CREATE TYPE reminder_status AS ENUM ('pendiente', 'enviado', 'fallido');

-- ============================================================
-- TABLE: profesionales
-- ============================================================

CREATE TABLE profesionales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  telefono TEXT,
  email TEXT,
  color TEXT NOT NULL DEFAULT '#6366f1',
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLE: servicios
-- ============================================================

CREATE TABLE servicios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  duracion_minutos INTEGER NOT NULL,
  precio DECIMAL(10,2) NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLE: profesional_servicios (N:N)
-- ============================================================

CREATE TABLE profesional_servicios (
  profesional_id UUID REFERENCES profesionales(id) ON DELETE CASCADE,
  servicio_id UUID REFERENCES servicios(id) ON DELETE CASCADE,
  PRIMARY KEY (profesional_id, servicio_id)
);

-- ============================================================
-- TABLE: clientes
-- ============================================================

CREATE TABLE clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL,
  email TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_clientes_telefono ON clientes(telefono);

-- ============================================================
-- TABLE: horarios (disponibilidad semanal por profesional)
-- ============================================================

CREATE TABLE horarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profesional_id UUID REFERENCES profesionales(id) ON DELETE CASCADE,
  dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(profesional_id, dia_semana)
);

-- ============================================================
-- TABLE: citas
-- ============================================================

CREATE TABLE citas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  profesional_id UUID REFERENCES profesionales(id) ON DELETE SET NULL,
  servicio_id UUID REFERENCES servicios(id) ON DELETE SET NULL,
  fecha_inicio TIMESTAMPTZ NOT NULL,
  fecha_fin TIMESTAMPTZ NOT NULL,
  status appointment_status NOT NULL DEFAULT 'pendiente',
  notas TEXT,
  precio_cobrado DECIMAL(10,2),
  origen TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_citas_fecha ON citas(fecha_inicio);
CREATE INDEX idx_citas_profesional ON citas(profesional_id, fecha_inicio);
CREATE INDEX idx_citas_cliente ON citas(cliente_id);

-- ============================================================
-- TABLE: recordatorios
-- ============================================================

CREATE TABLE recordatorios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cita_id UUID REFERENCES citas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  status reminder_status NOT NULL DEFAULT 'pendiente',
  enviado_at TIMESTAMPTZ,
  error_mensaje TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLE: configuracion (fila unica)
-- ============================================================

CREATE TABLE configuracion (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  nombre_salon TEXT NOT NULL DEFAULT 'Mi Estética',
  telefono TEXT,
  direccion TEXT,
  zona_horaria TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  intervalo_citas_minutos INTEGER NOT NULL DEFAULT 30,
  dias_anticipacion_reserva INTEGER NOT NULL DEFAULT 30,
  mensaje_confirmacion TEXT DEFAULT 'Hola {cliente}, tu cita para {servicio} con {profesional} el {fecha} a las {hora} ha sido confirmada. ¡Te esperamos!',
  mensaje_recordatorio TEXT DEFAULT 'Hola {cliente}, te recordamos tu cita mañana {fecha} a las {hora} para {servicio}. Si necesitás cambiarla, contactanos.',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default configuration row
INSERT INTO configuracion (id) VALUES (1);
