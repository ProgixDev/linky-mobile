-- Phase P.1 — KYC via Didit hosted verification (concept ported from getdraft).
--
-- users.kyc_status : compact mirror so every read path (auth payloads, badge
-- checks) avoids a join. State machine :
--   none → pending → in_review → approved | declined
--   (expired sessions reset the mirror to 'none' so the user can retry)
--
-- kyc_sessions : one row per Didit verification session. `decision` stores
-- Didit's full opaque payload (OCR, liveness, face-match, AML…) — the admin
-- console renders the "vérifications automatiques" panel from it, and the
-- manual-review queue (client-required fallback for private homeowners /
-- docs Didit can't auto-verify) works off status='in_review'.
--
-- RLS enabled, no policies — service-role only, auth at the edge-fn layer
-- (same posture as messaging / notifications).

alter table public.users
  add column kyc_status text not null default 'none'
    check (kyc_status in ('none', 'pending', 'in_review', 'approved', 'declined')),
  add column kyc_completed_at timestamptz;

create table public.kyc_sessions (
  id uuid primary key default public.uuidv7(),
  user_id uuid not null references public.users(id),
  didit_session_id text not null,
  workflow_id text not null,
  status text not null default 'pending'
    check (status in ('pending', 'in_review', 'approved', 'declined', 'expired')),
  decision jsonb,
  verification_url text,
  -- 'webhook' | 'poll' | 'manual:<admin uuid>' — where the latest status came from.
  decided_via text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint kyc_sessions_didit_session_unique unique (didit_session_id)
);

create index kyc_sessions_user_created_idx on public.kyc_sessions (user_id, created_at desc);
-- Admin queue + webhook lookups only ever touch open sessions.
create index kyc_sessions_open_idx on public.kyc_sessions (status) where status in ('pending', 'in_review');
-- One open session per user : concurrent kyc-start calls must not create
-- duplicate Didit sessions (the orphan would later expire and fight the
-- real one over the users.kyc_status mirror). kyc-start catches 23505 and
-- re-selects the winner.
create unique index kyc_sessions_one_open_per_user on public.kyc_sessions (user_id)
  where status in ('pending', 'in_review');

alter table public.kyc_sessions enable row level security;
