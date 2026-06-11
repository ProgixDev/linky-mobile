-- Phase T.1 — roles become real.
--
-- Before this migration, roles lived only in device MMKV
-- (app-mobile/src/stores/auth.ts), default ['buyer'], reset on signOut. Auth
-- payloads carried no roles, so a reinstall or sign-in on a second device
-- silently degraded a seller back to a pure buyer. Onboarding's
-- profile-setup collected display_name + city in steps 1–2 and DISCARDED
-- them (no profile-update endpoint existed). product-create and
-- property-create gate on requireUser only — no role, no KYC check — so
-- any signed-in caller could publish.
--
-- This migration:
--   1) adds public.users.roles text[] with a non-empty CHECK and a subset
--      CHECK against the V1 role set ('buyer','seller','agent'),
--   2) adds public.users.city text (nullable) so the new update-profile
--      endpoint can persist the city the onboarding currently throws away,
--   3) backfills NOTHING — every existing user defaults to {buyer}; real
--      sellers and agents re-assert their role via the new "Mes rôles"
--      screen (which calls update-profile). This is the only safe default
--      given that we never had a server-side source of truth for roles
--      until now.

alter table public.users
  add column if not exists roles text[] not null default '{buyer}',
  add column if not exists city  text;

-- Non-empty + V1-only role set. Two CHECKs (not one combined) so a
-- validation failure points at the actual offending rule.
alter table public.users
  drop constraint if exists users_roles_nonempty_check;
alter table public.users
  add constraint users_roles_nonempty_check
  check (array_length(roles, 1) is not null and array_length(roles, 1) >= 1);

alter table public.users
  drop constraint if exists users_roles_subset_check;
alter table public.users
  add constraint users_roles_subset_check
  check (roles <@ array['buyer','seller','agent']::text[]);

-- city: light bound to keep storage predictable. Free text within ≤80 so
-- the 39 prefecture capitals + Conakry communes (longest ~12 chars) and
-- short user-typed fallbacks both fit. Edge fn does the stricter ≤40
-- product-side bound; the column bound is just a safety net.
alter table public.users
  drop constraint if exists users_city_len_check;
alter table public.users
  add constraint users_city_len_check
  check (city is null or char_length(city) between 1 and 80);
