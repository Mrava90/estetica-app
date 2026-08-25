-- Campo para orden precalculado en la página de reservas (null = sin ranking)
ALTER TABLE servicios ADD COLUMN orden_reserva INTEGER;
