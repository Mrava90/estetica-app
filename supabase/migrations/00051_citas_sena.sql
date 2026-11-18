-- Seña cobrada por adelantado para un turno (informativo: lo contable sigue en el sheet).
-- sena_monto NULL = sin seña.
alter table public.citas add column if not exists sena_monto numeric;
alter table public.citas add column if not exists sena_medio text;
alter table public.citas add column if not exists sena_fecha date;
