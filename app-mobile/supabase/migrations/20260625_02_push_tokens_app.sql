-- push_tokens.app — which Linky app a device token belongs to.
--
-- A user who is BOTH a marketplace user (buyer/seller) and a livreur has the
-- push tokens of BOTH apps stored under one user_id. Without this column,
-- notify() would fan a livreur-assignment push out to the marketplace app too
-- (and vice-versa). `app` lets a notify() caller target a single app's tokens.
--
-- Default 'marketplace' backfills every existing row (they predate the driver
-- app) and keeps the marketplace app working unchanged — it does not send `app`,
-- so register-push-token defaults it. The driver app sends app:'driver'.
--
-- Applied via the Supabase Management API (NOT `supabase db push` — the remote
-- migration history versions diverge from these filenames; see project memory
-- "Migration history mismatch"). This file is the durable record.
alter table public.push_tokens
  add column if not exists app text not null default 'marketplace';

comment on column public.push_tokens.app is
  'Which Linky app this device token belongs to (marketplace | driver). Lets notify() target one app so a user who is both buyer/seller AND livreur does not get livreur pushes in the marketplace app. Validated at register-push-token; backfilled to marketplace.';
