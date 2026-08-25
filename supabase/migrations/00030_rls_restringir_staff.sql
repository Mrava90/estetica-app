-- ============================================================
-- SECURITY FIX (Critico #1 del reporte)
--
-- Problema: las policies "TO authenticated USING (true)" permitian a
-- cualquier usuario con JWT valido (incluyendo clientes con magic link
-- y email externo) leer/modificar TODAS las tablas del dashboard.
--
-- Fix:
--   1. Funcion helper is_staff_user() que solo devuelve true si el JWT
--      pertenece a un email @estetica.local o admin whitelisteado.
--   2. Reescribe TODAS las policies "authenticated USING true" para
--      exigir is_staff_user() (aplicado por reflexion sobre pg_policies).
--   3. Elimina la policy anon "Public can read clientes by phone" que
--      permitia leer la tabla clientes completa (no filtraba por tel).
--      El lookup publico ya se hace server-side por /api/reservar/booking
--      que solo devuelve el nombre (fix critico #2 ya deployado).
-- ============================================================

-- 1. Funcion helper: identificar staff/admin por email del JWT
CREATE OR REPLACE FUNCTION public.is_staff_user() RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(
    (auth.jwt() ->> 'email') LIKE '%@estetica.local'
    OR (auth.jwt() ->> 'email') = 'ravamartin@gmail.com',
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_staff_user() TO authenticated, anon;

-- 2. Reescribir todas las policies permisivas "authenticated USING true"
-- Este DO block se auto-adapta a policies presentes y futuras.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, cmd
    FROM pg_policies
    WHERE schemaname = 'public'
      AND 'authenticated' = ANY(roles)
      AND (
        qual = 'true'
        OR with_check = 'true'
        OR (qual IS NULL AND with_check IS NULL)
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    IF r.cmd = 'SELECT' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR SELECT TO authenticated USING (public.is_staff_user())',
        r.policyname, r.schemaname, r.tablename
      );
    ELSIF r.cmd = 'INSERT' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR INSERT TO authenticated WITH CHECK (public.is_staff_user())',
        r.policyname, r.schemaname, r.tablename
      );
    ELSIF r.cmd = 'UPDATE' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR UPDATE TO authenticated USING (public.is_staff_user()) WITH CHECK (public.is_staff_user())',
        r.policyname, r.schemaname, r.tablename
      );
    ELSIF r.cmd = 'DELETE' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR DELETE TO authenticated USING (public.is_staff_user())',
        r.policyname, r.schemaname, r.tablename
      );
    ELSIF r.cmd = 'ALL' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR ALL TO authenticated USING (public.is_staff_user()) WITH CHECK (public.is_staff_user())',
        r.policyname, r.schemaname, r.tablename
      );
    END IF;
    RAISE NOTICE 'Actualizada policy % en %.% (cmd=%)', r.policyname, r.schemaname, r.tablename, r.cmd;
  END LOOP;
END;
$$;

-- 3. Eliminar la fuga anon de clientes
DROP POLICY IF EXISTS "Public can read clientes by phone" ON public.clientes;

-- 4. Refrescar cache de PostgREST
NOTIFY pgrst, 'reload schema';
