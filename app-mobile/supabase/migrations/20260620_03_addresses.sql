-- Pre-prod: address book backend. Replaces the X.7 "Bientot" placeholder in
-- settings/addresses.tsx (the feature was promised in UI but never built).
-- An address is a free-form label + curated Guinea city + optional
-- district/details ; no verification step is needed (unlike phones, addresses
-- are not an auth surface). The partial unique index enforces at-most-one
-- default per user_id at the DB level, mirroring the phones one-primary
-- pattern so the "set default" RPC's clear-then-set is the only path that
-- can survive concurrent writes.

create table if not exists public.addresses (
  id          uuid primary key default public.uuidv7(),
  user_id     uuid not null references public.users(id) on delete cascade,
  label       text not null,
  city        text not null,
  district    text,
  details     text,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists addresses_user_idx on public.addresses(user_id);
create unique index if not exists addresses_one_default_per_user
  on public.addresses(user_id) where is_default;

alter table public.addresses enable row level security;
-- No public policies: write endpoints run as service_role after requireUser().

-- Atomically clear all other defaults for p_user_id then set this one. Mirrors
-- the phones set-primary clear-then-set ; running both updates inside a single
-- plpgsql function ensures the partial unique index can't trip mid-flow even
-- if two concurrent "set default" calls race on the same user. Ownership is
-- enforced inside : passing a foreign address_id raises ADDRESS_NOT_FOUND so
-- the edge fn doesn't have to double-check before calling.
create or replace function public.set_default_address(
  p_user_id    uuid,
  p_address_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.addresses where id = p_address_id;
  if v_owner is null then
    raise exception 'ADDRESS_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_owner <> p_user_id then
    raise exception 'ADDRESS_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.addresses
     set is_default = false
   where user_id = p_user_id
     and is_default = true
     and id <> p_address_id;

  update public.addresses
     set is_default = true
   where id = p_address_id
     and user_id = p_user_id;
end;
$$;

revoke all on function public.set_default_address(uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_default_address(uuid, uuid) to service_role;
