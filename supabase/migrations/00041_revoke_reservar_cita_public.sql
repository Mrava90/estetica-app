-- ============================================================
-- Fix CRITICAL: RPC reservar_cita_atomica quedaba invocable por cualquier
-- cliente con la anon key. PostgreSQL otorga EXECUTE a PUBLIC por default
-- a las funciones nuevas, y el GRANT explicito a service_role no revoca eso.
--
-- Efecto del ataque previo: un atacante con la anon key (que es publica y
-- viaja en el bundle del front) podia hacer POST /rest/v1/rpc/reservar_cita_atomica
-- sin pasar por /api/reservar/booking, salteando: rate limit, validacion de
-- servicio activo, profesional habilitado, horario laboral, dia_anticipacion,
-- alineacion de slot y precio.
--
-- Fix: REVOKE de PUBLIC, anon y authenticated. La service_role NO se ve
-- afectada porque es superusuario en Supabase. El unico caller legitimo
-- (/api/reservar/booking) usa el admin client con service_role, entonces
-- sigue funcionando igual.
--
-- Verificacion post-deploy:
--   1. Probar reservar un turno desde la web → debe funcionar (usa service_role via API)
--   2. Probar POST directo al RPC con anon key → debe dar permission denied
-- ============================================================

-- Firma actual de la funcion (definida en 00039). Necesito la firma exacta
-- porque REVOKE requiere match de parametros.
REVOKE ALL ON FUNCTION public.reservar_cita_atomica(
  UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, NUMERIC, NUMERIC, UUID, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

-- Re-otorgar solo a service_role por si acaso.
GRANT EXECUTE ON FUNCTION public.reservar_cita_atomica(
  UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, NUMERIC, NUMERIC, UUID, TEXT, TEXT
) TO service_role;

NOTIFY pgrst, 'reload schema';
