-- Phase LIVREUR ONBOARDING — courier application + admin vetting.
--
-- A delivery man APPLIES (personal info + a short questionnaire), the admin
-- REVIEWS and accepts/rejects in the admin console, and on ACCEPT the user is
-- granted the 'livreur' role (the role was widened into the V1 set in
-- 20260622_01_livreur_role.sql). The driver app gates its whole space on the
-- application status (none/pending/approved/rejected).
--
-- One application row per user (unique user_id). Re-applying after a rejection
-- REPLACES the row back to 'pending' (handled in the livreur-apply edge fn).
-- RLS is enabled with NO policies: every read/write path runs as service_role
-- after requireUser()/assertAdmin(), same posture as kyc_sessions / deliveries.

-- ===========================================================================
-- 1. livreur_applications table
-- ===========================================================================
create table if not exists public.livreur_applications (
  id            uuid primary key default public.uuidv7(),
  user_id       uuid not null unique references public.users(id) on delete cascade,
  full_name     text not null,
  city          text not null,
  vehicle_type  text not null check (vehicle_type in ('moto','voiture','velo','a_pied')),
  id_photo_url  text,                         -- optional (own-storage URL only, if provided)
  answers       jsonb not null default '{}',  -- { zones, availability, has_license_insurance, accepts_qr_process, accepts_linky_terms }
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  reject_reason text,
  reviewed_by   uuid references public.users(id),
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists livreur_applications_status_idx
  on public.livreur_applications (status, created_at desc);

alter table public.livreur_applications enable row level security;
-- No public policies: service_role bypasses RLS; authed clients go through fns.

-- ===========================================================================
-- 2. decide_livreur_application(p_application_id, p_decision, p_reason, p_admin_id)
--    Admin accept/reject, applied atomically with the role grant so the
--    application transition and the users.roles append can never diverge.
--    Only PENDING applications can be decided (terminal states are immutable
--    here; a re-application goes through livreur-apply again).
--
--    approve → status='approved', reviewed_by/at set, reject_reason cleared,
--              and 'livreur' appended to the applicant's users.roles if absent.
--    reject  → status='rejected', reject_reason set, reviewed_by/at set.
--
--    Returns the updated application row as jsonb (the edge fn shapes it for
--    the API + appends the admin_actions audit row).
-- ===========================================================================
create or replace function public.decide_livreur_application(
  p_application_id uuid,
  p_decision       text,
  p_reason         text,
  p_admin_id       uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app     record;
  v_result  jsonb;
  v_now     timestamptz := now();
begin
  if p_decision not in ('approve', 'reject') then
    raise exception 'INVALID_DECISION';
  end if;

  select * into v_app
    from public.livreur_applications
    where id = p_application_id
    for update;
  if not found then raise exception 'APPLICATION_NOT_FOUND'; end if;

  if v_app.status <> 'pending' then
    raise exception 'APPLICATION_NOT_PENDING';
  end if;

  if p_decision = 'approve' then
    update public.livreur_applications
      set status        = 'approved',
          reject_reason = null,
          reviewed_by   = p_admin_id,
          reviewed_at   = v_now,
          updated_at    = v_now
      where id = v_app.id;

    -- Grant the 'livreur' role idempotently (append only if absent). Same
    -- semantics as toggling the role via update-profile, just admin-driven.
    update public.users
      set roles      = case when 'livreur' = any(roles) then roles
                            else array_append(roles, 'livreur') end,
          updated_at = v_now
      where id = v_app.user_id;
  else
    update public.livreur_applications
      set status        = 'rejected',
          reject_reason = p_reason,
          reviewed_by   = p_admin_id,
          reviewed_at   = v_now,
          updated_at    = v_now
      where id = v_app.id;
  end if;

  select to_jsonb(la.*) into v_result
    from public.livreur_applications la
    where la.id = v_app.id;
  return v_result;
end;
$$;

revoke all on function public.decide_livreur_application(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.decide_livreur_application(uuid, text, text, uuid)
  to service_role;
