-- Agrega campo alias_pago a profesionales para guardar destino de pago
-- (alias MercadoPago, CBU, CVU o descripción libre).
--
-- Solo lectura/escritura desde /personal (dashboard staff). No se expone
-- publicamente porque cae bajo las policies RLS de staff-only.

ALTER TABLE profesionales
  ADD COLUMN IF NOT EXISTS alias_pago TEXT;

NOTIFY pgrst, 'reload schema';
