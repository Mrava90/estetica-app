-- ============================================================
-- Fix: dropear el EXCLUDE constraint anti-solapamiento porque es
-- incompatible con la feature de tolerancia por profesional.
--
-- Contexto:
-- - La migration 00032 agrego un EXCLUDE constraint que rechaza
--   CUALQUIER solapamiento entre citas activas del mismo profesional.
-- - La app tiene una feature (columna profesionales.tolerancia_solapamiento_min)
--   que permite configurar cuantos minutos de solapamiento son aceptables
--   por profesional. Ej: Camila permite pisar 10 min, Lola 15 min.
-- - El EXCLUDE ignoraba esa tolerancia -> los slots que la UI mostraba como
--   disponibles eran rechazados al confirmar.
--
-- Fix:
-- - Dropear el EXCLUDE. La barrera anti-doble-booking queda en el codigo
--   del booking (chequeo de overlap total con tolerancia) + el index viejo
--   uniq_cita_slot_activa (protege solapamientos EXACTOS de fecha_inicio,
--   que es el race condition mas realista).
--
-- Trade-off:
-- - Se pierde la garantia atomica de "0 solapamiento". Vuelve a haber una
--   ventana chica de race donde 2 requests podrian pasar el check antes
--   que cualquiera inserte. Es aceptable porque:
--   * Existe la tolerancia como concepto de negocio (algun solapamiento OK)
--   * uniq_cita_slot_activa sigue previniendo colisiones exactas
--   * Volumen de reservas concurrentes es bajo
-- ============================================================

ALTER TABLE citas DROP CONSTRAINT IF EXISTS no_solapamiento_citas_activas;

NOTIFY pgrst, 'reload schema';
