-- ============================================================
-- Enable RLS on all tables
-- ============================================================

ALTER TABLE profesionales ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE profesional_servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE horarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE citas ENABLE ROW LEVEL SECURITY;
ALTER TABLE recordatorios ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Staff policies (authenticated users can do everything)
-- ============================================================

CREATE POLICY "Staff can read profesionales" ON profesionales FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert profesionales" ON profesionales FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update profesionales" ON profesionales FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Staff can delete profesionales" ON profesionales FOR DELETE TO authenticated USING (true);

CREATE POLICY "Staff can read servicios" ON servicios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert servicios" ON servicios FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update servicios" ON servicios FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Staff can delete servicios" ON servicios FOR DELETE TO authenticated USING (true);

CREATE POLICY "Staff can read profesional_servicios" ON profesional_servicios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert profesional_servicios" ON profesional_servicios FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can delete profesional_servicios" ON profesional_servicios FOR DELETE TO authenticated USING (true);

CREATE POLICY "Staff can read clientes" ON clientes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert clientes" ON clientes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update clientes" ON clientes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Staff can delete clientes" ON clientes FOR DELETE TO authenticated USING (true);

CREATE POLICY "Staff can read horarios" ON horarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert horarios" ON horarios FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update horarios" ON horarios FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Staff can delete horarios" ON horarios FOR DELETE TO authenticated USING (true);

CREATE POLICY "Staff can read citas" ON citas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert citas" ON citas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update citas" ON citas FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Staff can delete citas" ON citas FOR DELETE TO authenticated USING (true);

CREATE POLICY "Staff can read recordatorios" ON recordatorios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert recordatorios" ON recordatorios FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update recordatorios" ON recordatorios FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Staff can read configuracion" ON configuracion FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can update configuracion" ON configuracion FOR UPDATE TO authenticated USING (true);

-- ============================================================
-- Public policies (for online booking page - anon users)
-- ============================================================

CREATE POLICY "Public can read active profesionales" ON profesionales FOR SELECT TO anon
  USING (activo = true);

CREATE POLICY "Public can read active servicios" ON servicios FOR SELECT TO anon
  USING (activo = true);

CREATE POLICY "Public can read profesional_servicios" ON profesional_servicios FOR SELECT TO anon
  USING (true);

CREATE POLICY "Public can read active horarios" ON horarios FOR SELECT TO anon
  USING (activo = true);

CREATE POLICY "Public can read citas for availability" ON citas FOR SELECT TO anon
  USING (status IN ('pendiente', 'confirmada'));

CREATE POLICY "Public can create citas" ON citas FOR INSERT TO anon
  WITH CHECK (origen = 'online');

CREATE POLICY "Public can read configuracion" ON configuracion FOR SELECT TO anon
  USING (true);

CREATE POLICY "Public can insert clientes" ON clientes FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "Public can read clientes by phone" ON clientes FOR SELECT TO anon
  USING (true);
