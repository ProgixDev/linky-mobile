-- Diaspora gap in the Guinea/abroad payment-profile rule (src/lib/paymentProfile.ts):
-- a user who kept a +224 SIM while living abroad is classified 'guinea' and
-- never sees the Stripe card option they actually need. profileFromPhone()
-- stays the deliberate default (documented in that file); this column lets a
-- user override it explicitly. false = no override, current behavior.
alter table public.users
  add column if not exists payment_abroad_override boolean not null default false;
