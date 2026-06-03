-- =====================================================================
-- Phase K.1 — Admin identity + audit foundations.
-- =====================================================================
-- Q1 (binary admin model): is_admin on public.users. V1 ships single-admin;
-- when we cross 2 admins or need module-scoped permissions we upgrade to
-- either an admin_role text column or a public.admin_users join table. See
-- memory project_admin_role_scoping for the trigger criteria. Until then,
-- one boolean keeps every admin endpoint to a one-line check
-- (`select is_admin from public.users where id = caller_id`).
--
-- Q3 (append-only audit): public.admin_actions records every privileged
-- act with before/after snapshots so the trail is reconstructable without
-- reading code. NEVER delete from this table — bug-fixes that turn out to
-- be misclicks should be reversed via a NEW row (action='reverse'), not by
-- mutating history. See memory project_admin_actions_retention for the
-- partition / cold-storage cutover plan when row count crosses 1M.
--
-- Q4 (no RBAC): no role column on admin_actions. When we move to
-- multi-admin we add `admin_role` to the audit row at write time so the
-- log records who-could-do-what at the moment of action (a future role
-- change must not retroactively rewrite the meaning of past entries).
--
-- Out-of-band: this migration does NOT promote any user. Use a one-shot
-- UPDATE outside CI to flip a chosen account, so replay-on-fresh-DB stays
-- deterministic and we don't accidentally re-promote a deleted account.

alter table public.users
  add column if not exists is_admin boolean not null default false;

create table if not exists public.admin_actions (
  id uuid primary key default public.uuidv7(),
  admin_id uuid not null references public.users(id),
  target_type text not null,
  target_id uuid not null,
  action text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  before_snapshot jsonb,
  after_snapshot jsonb,
  created_at timestamptz not null default now()
);

-- (target_type, target_id) → "show me everything that's ever happened to
-- order/dispute/user X". Hot path for the per-target detail view.
create index if not exists admin_actions_target_idx
  on public.admin_actions (target_type, target_id);

-- (admin_id, created_at desc) → "show me what admin X did today / this
-- week". Per-admin activity feed; created_at desc matches the natural
-- recency order used in the console.
create index if not exists admin_actions_admin_idx
  on public.admin_actions (admin_id, created_at desc);
