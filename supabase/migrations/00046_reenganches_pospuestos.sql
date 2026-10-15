-- Alertas de reenganche pospuestas ("la clienta puede recien la semana que
-- viene"). Mientras hasta > hoy la alerta no aparece; desde ese dia vuelve a
-- Pendientes con la nota, aunque ya este fuera de la ventana de 21-28 dias.
-- Se borra sola cuando se le vuelve a mandar el WhatsApp (ver /marcar).

CREATE TABLE IF NOT EXISTS reenganches_pospuestos (
  cliente_id      UUID PRIMARY KEY REFERENCES clientes(id) ON DELETE CASCADE,
  hasta           DATE NOT NULL,
  nota            TEXT,
  -- La visita a la que se refiere la alerta (para el mensaje y los dias)
  ultima_visita   TIMESTAMPTZ NOT NULL,
  servicio_nombre TEXT,
  profesional_nombre TEXT,
  creado_por      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reenganches_pospuestos_hasta ON reenganches_pospuestos(hasta);

ALTER TABLE reenganches_pospuestos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can manage reenganches_pospuestos" ON reenganches_pospuestos;
CREATE POLICY "Staff can manage reenganches_pospuestos"
  ON reenganches_pospuestos FOR ALL TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

NOTIFY pgrst, 'reload schema';
