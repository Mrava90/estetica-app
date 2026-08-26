-- ============================================================
-- Critical (nueva ronda): eliminar policies anon sobre citas.
--
-- La policy "Public can read citas for availability" permitia a anon
-- leer citas activas -> notas, precios, cliente_id, etc. filtrados
-- desde el navegador.
--
-- La policy "Public can create citas" permitia a anon insertar citas
-- con origen='online' sin pasar por /api/reservar/booking (que valida
-- todo: horario laboral, bloqueos, solapamientos, promo, etc).
--
-- Fix:
--   - DROP ambas policies.
--   - Todo el flujo publico pasa ahora por /api/reservar/disponibilidad
--     (GET, solo devuelve slots libres) y /api/reservar/booking (POST,
--     server-side con service_role y todas las validaciones).
-- ============================================================

DROP POLICY IF EXISTS "Public can read citas for availability" ON public.citas;
DROP POLICY IF EXISTS "Public can create citas" ON public.citas;

NOTIFY pgrst, 'reload schema';
