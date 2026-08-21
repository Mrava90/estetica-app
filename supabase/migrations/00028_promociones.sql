-- Sistema de promociones (Happy Hours + reglas generales)
-- Cada promo puede aplicar por día de semana, franja horaria, servicios y/o profesionales.

CREATE TABLE promociones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  descripcion TEXT,

  -- Descuento: uno de los tres debe estar seteado.
  --   pct: descuento porcentual uniforme (ej: 20% para todos los servicios que aplican)
  --   monto: descuento fijo en pesos uniforme (ej: -$5000 para todos)
  --   precios_override: precio final específico por servicio {"servicio_uuid": 29000}
  --     (útil para promos con precios "redondos" tipo Happy Hour del salón)
  descuento_pct NUMERIC(5, 2) CHECK (descuento_pct IS NULL OR (descuento_pct > 0 AND descuento_pct <= 100)),
  descuento_monto NUMERIC(12, 2) CHECK (descuento_monto IS NULL OR descuento_monto > 0),
  precios_override JSONB,  -- ej: {"uuid-servicio-1": 29000, "uuid-servicio-2": 26000}
  CHECK ((descuento_pct IS NOT NULL) OR (descuento_monto IS NOT NULL) OR (precios_override IS NOT NULL)),

  -- Condiciones extra
  metodo_pago_requerido TEXT CHECK (metodo_pago_requerido IS NULL OR metodo_pago_requerido IN ('efectivo', 'mercadopago', 'transferencia')),

  -- Cuándo aplica: null en cada uno = "siempre"
  dias_semana INTEGER[] CHECK (dias_semana IS NULL OR (dias_semana <@ ARRAY[0,1,2,3,4,5,6])), -- 0=dom, 6=sab
  hora_desde TIME,
  hora_hasta TIME,
  fecha_desde DATE,
  fecha_hasta DATE,

  -- A qué aplica: null = todos
  servicios_ids UUID[],
  profesionales_ids UUID[],

  activa BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_promociones_activa ON promociones(activa) WHERE activa = TRUE;

-- Columnas nuevas en citas para trazabilidad del descuento aplicado
ALTER TABLE citas
  ADD COLUMN IF NOT EXISTS promocion_aplicada_id UUID REFERENCES promociones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS precio_original NUMERIC(12, 2);

-- RLS: promos son lectura pública (para /reservar), escritura solo admin (via API con admin client)
ALTER TABLE promociones ENABLE ROW LEVEL SECURITY;

-- Cualquiera puede leer las promos activas (necesario para /reservar público)
CREATE POLICY "Public can read active promos" ON promociones
  FOR SELECT TO anon
  USING (activa = TRUE);

-- Staff autenticado puede leer todas (activas e inactivas)
CREATE POLICY "Staff can read all promos" ON promociones
  FOR SELECT TO authenticated
  USING (true);

-- Escritura solo via admin client (sin policies para authenticated/anon)
