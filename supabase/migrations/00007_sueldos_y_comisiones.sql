-- Add fixed salary field to profesionales
ALTER TABLE profesionales
  ADD COLUMN IF NOT EXISTS sueldo_fijo numeric DEFAULT 0;

-- Add commission amount per appointment (from sheets column I)
ALTER TABLE citas
  ADD COLUMN IF NOT EXISTS comision_profesional numeric DEFAULT 0;

-- Toggle to show/hide professional in calendar
ALTER TABLE profesionales
  ADD COLUMN IF NOT EXISTS visible_calendario boolean DEFAULT true;

-- Historical salary records (one per professional per effective month)
CREATE TABLE IF NOT EXISTS sueldos_fijos_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profesional_id uuid NOT NULL REFERENCES profesionales(id) ON DELETE CASCADE,
  monto numeric NOT NULL DEFAULT 0,
  vigente_desde date NOT NULL, -- first day of month, e.g. '2026-02-01'
  created_at timestamptz DEFAULT now(),
  UNIQUE(profesional_id, vigente_desde)
);

ALTER TABLE sueldos_fijos_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read sueldos_fijos_historico"
  ON sueldos_fijos_historico FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert sueldos_fijos_historico"
  ON sueldos_fijos_historico FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update sueldos_fijos_historico"
  ON sueldos_fijos_historico FOR UPDATE TO authenticated USING (true);

-- Service role needs full access for sync
CREATE POLICY "Service role full access sueldos_fijos_historico"
  ON sueldos_fijos_historico FOR ALL TO service_role USING (true);
