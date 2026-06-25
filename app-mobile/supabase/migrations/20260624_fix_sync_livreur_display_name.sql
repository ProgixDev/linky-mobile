-- Phase LIVREUR ONBOARDING fix (2026-06-24): sync the courier account
-- display_name with the name on their application.
--
-- Bug: a courier could apply with a real name (e.g. Chouaib) on an account
-- whose users.display_name was something else (e.g. a test account previously
-- named Islem). admin-list-livreurs (the dispatch picker + deliveries / users
-- views) reads users.display_name, so the WRONG name showed in the admin even
-- though livreur_applications.full_name was correct.
--
-- Fix: on APPROVE, set the user display_name to the vetted application
-- full_name, so every admin surface shows the courier real name. Plus a
-- one-shot backfill for already-approved couriers.

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

    -- Grant the livreur role idempotently AND sync the account name to the
    -- vetted application name, so dispatch / users / deliveries views (which
    -- read users.display_name) show the courier real name, not a stale one.
    update public.users
      set roles        = case when 'livreur' = any(roles) then roles
                              else array_append(roles, 'livreur') end,
          display_name = v_app.full_name,
          updated_at   = v_now
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

-- One-shot backfill: align existing APPROVED couriers display_name with their
-- application name (fixes Chouaib shown as Islem, and null display names).
update public.users u
  set display_name = la.full_name,
      updated_at   = now()
  from public.livreur_applications la
  where la.user_id = u.id
    and la.status = 'approved'
    and u.display_name is distinct from la.full_name;
