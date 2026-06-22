-- Phase LIVREUR.1 — add 'livreur' to the users.roles V1 set.
--
-- 20260611_03_user_roles.sql installed the subset CHECK as
--   roles <@ array['buyer','seller','agent']::text[]
-- The driver/livreur is the 4th role (per the 2026-06-21 client meeting +
-- contract Art. 5 logistics module). It lives INSIDE the existing Linky app
-- as a role-gated space (mirroring seller/agent) so a driver can sign in
-- once and either accept deliveries OR buy/sell on the same account.
--
-- This migration only widens the CHECK ; no backfill, no default change. A
-- user becomes a livreur by toggling the role in profile-setup or "Mes
-- rôles" → update-profile, same path as seller/agent.

alter table public.users
  drop constraint if exists users_roles_subset_check;
alter table public.users
  add constraint users_roles_subset_check
  check (roles <@ array['buyer','seller','agent','livreur']::text[]);
