-- Phase Finish #5 — baseline identity-schema snapshot for reproducibility.
--
-- WHY: the live DB has the identity tables (users / otp_codes / phones /
-- emails / kyc_sessions), the uuidv7() helper, citext + pgcrypto
-- extensions, and the avatars storage bucket — but NO migration in this
-- repo creates them. They were authored before migration tracking started.
-- The 20260528_02 migration already INSERTs into public.phones and
-- public.emails, so a fresh apply on an empty DB would fail at that
-- migration without these objects existing first.
--
-- This file is the captured snapshot of the live schema, intended for
-- handoff reproducibility (spinning up a fresh project, an isolated test
-- DB, or a CI seed). DO NOT apply it to the live DB — it already has
-- every object below, and CREATE IF NOT EXISTS makes the apply a no-op on
-- the live env but the LOCAL migration_history mismatch
-- ([[project_migration_history_mismatch]]) means `supabase db push` is
-- unusable regardless.
--
-- Captured 2026-06-20 via Management API /database/query reads against
-- information_schema, pg_constraint, pg_indexes, pg_proc, pg_extension,
-- and storage.buckets. The DDL below is functionally equivalent — column
-- order + index names + check constraint expressions are preserved
-- verbatim, table comments are mine for context.

-- ─── extensions ─────────────────────────────────────────────────────────
-- Both live in the `extensions` schema per Supabase defaults. citext powers
-- the case-insensitive emails.address column ; pgcrypto provides
-- gen_random_bytes() that uuidv7() consumes.
create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ─── uuidv7() helper ────────────────────────────────────────────────────
-- All identity tables (and the rest of the schema) default their PK to
-- public.uuidv7() rather than gen_random_uuid() so primary keys sort by
-- creation time — handy for keyset pagination, less random for index
-- locality. PARALLEL SAFE because it only reads from extensions and the
-- clock.
create or replace function public.uuidv7()
returns uuid
language plpgsql
parallel safe
set search_path to ''
as $function$
declare
  unix_ts_ms bytea;
  uuid_bytes bytea;
begin
  unix_ts_ms := substring(int8send((extract(epoch from clock_timestamp()) * 1000)::bigint) from 3);
  uuid_bytes := unix_ts_ms || extensions.gen_random_bytes(10);
  uuid_bytes := set_byte(uuid_bytes, 6, (b'0111' || get_byte(uuid_bytes, 6)::bit(4))::bit(8)::int);
  uuid_bytes := set_byte(uuid_bytes, 8, (b'10'   || get_byte(uuid_bytes, 8)::bit(6))::bit(8)::int);
  return encode(uuid_bytes, 'hex')::uuid;
end
$function$;

-- ─── users ──────────────────────────────────────────────────────────────
-- The core identity row. Roles is a text[] (NOT NULL, default {buyer})
-- with a subset-check + non-empty-check enforcing the three V1 roles
-- exclusively. kyc_status enum string is the authoritative source for the
-- soft-gate in product-create / property-create (Phase Finish #1).
create table if not exists public.users (
  id                uuid primary key default public.uuidv7(),
  display_name      text,
  locale            text not null default 'fr',
  status            text not null default 'active'
                    check (status in ('active','suspended','deleted')),
  last_seen_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  avatar_url        text,
  password_hash     text,
  is_admin          boolean not null default false,
  kyc_status        text not null default 'none'
                    check (kyc_status in ('none','pending','in_review','approved','declined')),
  kyc_completed_at  timestamptz,
  roles             text[] not null default '{buyer}'
                    check (array_length(roles, 1) is not null and array_length(roles, 1) >= 1)
                    check (roles <@ array['buyer','seller','agent']),
  city              text
                    check (city is null or (char_length(city) >= 1 and char_length(city) <= 80))
);
alter table public.users enable row level security;
-- No public policies : edge functions touch this via service_role only.

-- ─── otp_codes ──────────────────────────────────────────────────────────
-- Hashed OTP codes for phone + email sign-in AND for the add-phone /
-- add-email verification flows. user_id is NULL on signin codes (the
-- user doesn't exist yet at request time) and set on add-phone /
-- add-email codes so the verify step can refuse a cross-session replay.
create table if not exists public.otp_codes (
  id           uuid primary key default public.uuidv7(),
  channel      text not null check (channel in ('phone','email')),
  target       text not null,
  code_hash    text not null,
  purpose      text not null check (purpose in ('signin','add_phone','add_email')),
  user_id      uuid references public.users(id) on delete cascade,
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  attempts     smallint not null default 0,
  ip           inet,
  user_agent   text,
  created_at   timestamptz not null default now()
);
create index if not exists otp_codes_target_recent_idx
  on public.otp_codes (channel, target, created_at desc)
  where consumed_at is null;
create index if not exists otp_codes_target_created_at_idx
  on public.otp_codes (target, created_at desc);
alter table public.otp_codes enable row level security;

-- ─── phones ─────────────────────────────────────────────────────────────
-- Multi-phone-per-account, with a partial UNIQUE index enforcing exactly
-- one is_primary=true per user_id. e164 is globally UNIQUE — one phone
-- number can only ever be linked to one account.
create table if not exists public.phones (
  id           uuid primary key default public.uuidv7(),
  user_id      uuid not null references public.users(id) on delete cascade,
  e164         text not null check (e164 ~ '^\+[1-9][0-9]{6,14}$'),
  carrier      text check (carrier in ('orange','mtn','other')),
  is_primary   boolean not null default false,
  verified_at  timestamptz,
  created_at   timestamptz not null default now()
);
create unique index if not exists phones_e164_unique on public.phones (e164);
create index if not exists phones_user_id_idx on public.phones (user_id);
create unique index if not exists phones_one_primary_per_user
  on public.phones (user_id)
  where is_primary;
alter table public.phones enable row level security;

-- ─── emails ─────────────────────────────────────────────────────────────
-- Address column is citext so lookups are case-insensitive without the
-- caller having to lower() everywhere. Same partial-UNIQUE one-primary-per
-- pattern as phones.
create table if not exists public.emails (
  id           uuid primary key default public.uuidv7(),
  user_id      uuid not null references public.users(id) on delete cascade,
  address      citext not null,
  is_primary   boolean not null default false,
  verified_at  timestamptz,
  created_at   timestamptz not null default now()
);
create unique index if not exists emails_address_unique on public.emails (address);
create index if not exists emails_user_id_idx on public.emails (user_id);
create unique index if not exists emails_one_primary_per_user
  on public.emails (user_id)
  where is_primary;
alter table public.emails enable row level security;

-- ─── kyc_sessions ───────────────────────────────────────────────────────
-- One Didit verification attempt per row. didit_session_id is UNIQUE so
-- webhook + poll deliveries dedup naturally. The partial UNIQUE
-- one-open-per-user index keeps a user from opening two parallel verify
-- sessions (the kyc-start handler relies on this — a 23505 means "you
-- already have one open, reuse it").
create table if not exists public.kyc_sessions (
  id                 uuid primary key default public.uuidv7(),
  user_id            uuid not null references public.users(id),
  didit_session_id   text not null,
  workflow_id        text not null,
  status             text not null default 'pending'
                     check (status in ('pending','in_review','approved','declined','expired')),
  decision           jsonb,
  verification_url   text,
  decided_via        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  completed_at       timestamptz
);
create unique index if not exists kyc_sessions_didit_session_unique
  on public.kyc_sessions (didit_session_id);
create index if not exists kyc_sessions_user_created_idx
  on public.kyc_sessions (user_id, created_at desc);
create index if not exists kyc_sessions_open_idx
  on public.kyc_sessions (status)
  where status in ('pending','in_review');
create unique index if not exists kyc_sessions_one_open_per_user
  on public.kyc_sessions (user_id)
  where status in ('pending','in_review');
alter table public.kyc_sessions enable row level security;

-- ─── avatars storage bucket ─────────────────────────────────────────────
-- Public bucket — read URLs are anon-accessible. update-profile validates
-- that avatar_url points inside this bucket on this Supabase project, so
-- a client can't set an arbitrary external URL as a profile image.
-- file_size_limit + allowed_mime_types match the photo-upload-url fn's
-- expectations (jpg/png/webp, ≤5 MiB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
-- No storage.objects policies are needed : public=true gives read access,
-- and write access is gated through the edge functions' service_role
-- signed-URL handoff (photo-upload-url).
