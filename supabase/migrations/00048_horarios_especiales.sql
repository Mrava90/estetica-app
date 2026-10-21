-- Horarios especiales por periodo: reemplazan el horario semanal de una
-- profesional en las fechas que cubren (ver lib/horarios: tramosDelDia).
--
-- Una fila = un tramo. Para un dia cortado (ej. 9-13 y 14-18) van dos filas
-- con el mismo periodo. hora_inicio NULL = ese dia no trabaja.
-- dias_semana: 0=Dom..6=Sab, NULL = todos los dias del periodo.
-- Los desbloqueos de una fecha se siguen sumando por encima, como siempre.

CREATE TABLE IF NOT EXISTS horarios_especiales (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profesional_id UUID NOT NULL REFERENCES profesionales(id) ON DELETE CASCADE,
  fecha_desde    DATE NOT NULL,
  fecha_hasta    DATE NOT NULL,
  dias_semana    SMALLINT[],
  hora_inicio    TIME,
  hora_fin       TIME,
  motivo         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fecha_hasta >= fecha_desde),
  CHECK ((hora_inicio IS NULL) = (hora_fin IS NULL)),
  CHECK (hora_inicio IS NULL OR hora_fin > hora_inicio)
);

CREATE INDEX IF NOT EXISTS idx_horarios_especiales_prof_fechas
  ON horarios_especiales (profesional_id, fecha_desde, fecha_hasta);

ALTER TABLE horarios_especiales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can manage horarios_especiales" ON horarios_especiales;
CREATE POLICY "Staff can manage horarios_especiales"
  ON horarios_especiales FOR ALL TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

NOTIFY pgrst, 'reload schema';
