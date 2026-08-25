-- ============================================================
-- Security Fixes — cerrar accesos públicos a datos sensibles
-- ============================================================

-- 1. FACTURAS: reemplazar policy permisiva por una limitada a authenticated
DROP POLICY IF EXISTS "facturas_all" ON facturas;
ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage facturas" ON facturas
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
-- Antes: ALL roles (anon + authenticated). Ahora: solo authenticated.

-- 2. CLIENTES: quitar SELECT/INSERT público.
-- La página de reservas ahora usa /api/reservar/booking (server-side).
DROP POLICY IF EXISTS "Public can read clientes by phone" ON clientes;
DROP POLICY IF EXISTS "Public can insert clientes" ON clientes;

-- 3. AUDIT_LOG: cerrar — solo accesible vía admin client
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
-- Sin policies = nadie excepto service_role
