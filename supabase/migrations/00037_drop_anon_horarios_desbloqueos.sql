-- ============================================================
-- Cerrar lectura anon de horarios y desbloqueos.
--
-- Estas policies permitian a cualquier visitante leer horarios completos
-- y desbloqueos (incluido "motivo") consultando directo a Supabase con
-- la anon key. Ya nadie del frontend las usa asi: /reservar consume
-- /api/reservar/disponibilidad que corre server-side y solo devuelve
-- slots libres. Dropear reduce la superficie expuesta.
-- ============================================================

DROP POLICY IF EXISTS "Public can read active horarios" ON public.horarios;
DROP POLICY IF EXISTS "Public can read desbloqueos" ON public.desbloqueos;

NOTIFY pgrst, 'reload schema';
