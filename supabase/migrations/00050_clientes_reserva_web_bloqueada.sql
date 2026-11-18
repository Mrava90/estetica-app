-- Clientas que NO pueden sacar turno por la web (el staff sí les puede cargar a mano).
-- NULL = puede reservar. Con fecha = bloqueada desde ese momento.
alter table public.clientes add column if not exists reserva_web_bloqueada_at timestamptz;
