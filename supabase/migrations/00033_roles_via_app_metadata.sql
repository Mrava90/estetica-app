-- ============================================================
-- Medio #8: Roles centralizados via app_metadata
--
-- Antes:
--   La funcion is_staff_user() (migration 00030) chequeaba el rol
--   por email hardcoded ("ravamartin@gmail.com" o dominio "@estetica.local").
--   Fragil: agregar/mover admins requeria migration.
--
-- Ahora:
--   Los users tienen app_metadata.role = 'admin' | 'staff' seteado.
--   La funcion lee ese role. Mantiene fallback por email por seguridad
--   durante la transicion — si algun user staff no tiene metadata seteada
--   por error, sigue teniendo acceso via el fallback.
--
-- Metadata seteada previamente via Auth Admin API:
--   ravamartin@gmail.com    -> role: 'admin'
--   *@estetica.local        -> role: 'staff'
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_staff_user() RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(
    -- Preferido: role en app_metadata
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff')
    -- Fallback: por email (compat)
    OR (auth.jwt() ->> 'email') LIKE '%@estetica.local'
    OR (auth.jwt() ->> 'email') = 'ravamartin@gmail.com',
    false
  );
$$;

-- Nueva funcion para chequear admin especificamente (para /contabilidad y similares)
CREATE OR REPLACE FUNCTION public.is_admin_user() RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR (auth.jwt() ->> 'email') = 'ravamartin@gmail.com',
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_staff_user() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
