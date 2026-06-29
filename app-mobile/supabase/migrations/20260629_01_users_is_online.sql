-- Livreur availability — a courier toggles online/offline so dispatch knows who is
-- reachable. Default false: a granted livreur starts offline until they go online.
alter table public.users add column if not exists is_online boolean not null default false;
