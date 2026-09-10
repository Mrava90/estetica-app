-- ============================================================
-- Facturacion automatica de ventas cobradas por QR de MercadoPago.
--
-- Un cron corre una vez por dia (20:00 AR = 23:00 UTC), lee los cobros QR
-- de la API de MercadoPago y los factura en ARCA sin intervencion manual.
--
-- Por que MercadoPago y no el sheet:
--   * El monto y la fecha son exactos (sin errores de tipeo).
--   * Los cobros QR traen el CUIL del pagador (18 de 23 medidos en ago-sep),
--     del que se extrae el DNI para la factura.
--   * No depende de que alguien cargue el sheet primero.
--   * No hay ambiguedad: cada pago tiene un id unico.
--
-- Salvaguardas:
--   * Solo cobros con point_of_interaction = INSTORE (QR del local).
--     Transferencias y posnet Point quedan afuera.
--   * Tope de monto por factura — arriba de eso queda pendiente manual.
--   * Ante el primer error se frena toda la corrida.
--   * mp_payment_id UNIQUE garantiza que un pago no se facture dos veces.
--
-- El switch arranca APAGADO. Se prende desde /facturacion.
-- ============================================================

-- ── Config del switch ─────────────────────────────────────────────────────
ALTER TABLE configuracion
  ADD COLUMN IF NOT EXISTS facturacion_auto_qr BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS facturacion_auto_monto_max NUMERIC NOT NULL DEFAULT 100000,
  ADD COLUMN IF NOT EXISTS facturacion_auto_ultimo_run TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS facturacion_auto_ultimo_resultado TEXT,
  ADD COLUMN IF NOT EXISTS facturacion_auto_ultimo_error TEXT;

COMMENT ON COLUMN configuracion.facturacion_auto_qr IS
  'Si esta en true, el cron /api/cron/facturar-qr emite facturas automaticamente para los cobros QR de MercadoPago.';
COMMENT ON COLUMN configuracion.facturacion_auto_monto_max IS
  'Tope por factura. Un cobro QR que supere este monto NO se factura solo: queda para revision manual.';

-- ── Idempotencia: un pago de MP se factura una sola vez ───────────────────
ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS mp_payment_id BIGINT;

-- UNIQUE parcial: solo aplica a las filas que tienen mp_payment_id.
-- Las facturas viejas (que vienen del sheet, con afip_row_key) no se ven afectadas.
CREATE UNIQUE INDEX IF NOT EXISTS idx_facturas_mp_payment_id
  ON facturas (mp_payment_id)
  WHERE mp_payment_id IS NOT NULL;

COMMENT ON COLUMN facturas.mp_payment_id IS
  'ID del pago en MercadoPago que origino esta factura. UNIQUE — evita facturar dos veces el mismo cobro.';

NOTIFY pgrst, 'reload schema';
