-- Memoria de pagos de MercadoPago ya vistos.
--
-- /v1/payments/search de MP no es consistente: llamadas identicas devuelven
-- al azar conjuntos distintos, y cuando falta algo son siempre los cobros por
-- Point (medido 15/9/2026: ~50% de las llamadas). El GET por id si es
-- confiable. Entonces: cada vez que la busqueda devuelve un pago, se anota
-- aca; y cuando la busqueda se lo olvida, se lo trae por id.
--
-- Solo la usa el servidor con la service role. Sin politicas RLS a proposito:
-- con RLS activo y sin politicas, anon y authenticated no ven nada.

CREATE TABLE IF NOT EXISTS mp_pagos_vistos (
  id        BIGINT PRIMARY KEY,                  -- id del pago en MP
  fecha     TIMESTAMPTZ NOT NULL,                -- date_approved (o created) del pago
  visto_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mp_pagos_vistos_fecha_idx ON mp_pagos_vistos (fecha);

ALTER TABLE mp_pagos_vistos ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE mp_pagos_vistos IS
  'Ids de pagos de MP ya vistos, para completar lo que /v1/payments/search omite al azar (sobre todo Point).';
