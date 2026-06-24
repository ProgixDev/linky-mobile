-- Phase LIVREUR ASSIGNMENT — admin central dispatch.
--
-- assign_delivery (Phase LIVREUR.2) gates on caller = order SELLER, so the
-- admin cannot use it to dispatch. This adds an admin-only sibling that takes
-- a DELIVERY id (the admin dispatches by delivery, not by knowing the order),
-- skips the seller check (re-verifies is_admin instead), supports REASSIGN,
-- and keeps the escrow invariant (order must be paid/preparing — the same gate
-- assign_delivery uses, since the inverted-QR handoff only releases escrow for
-- those statuses). It does NOT touch escrow/handoff logic.
--
-- Assignable delivery states: unassigned, assigned, in_transit (reassign).
-- Terminal handoff states (delivered, failed, cancelled) are rejected.
-- Service-role only; called from the admin-assign-delivery edge fn after
-- assertAdmin.

create or replace function public.admin_assign_delivery(
  p_delivery_id uuid,
  p_livreur_id  uuid,
  p_admin_id    uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_admin boolean;
  v_delivery record;
  v_order    record;
  v_livreur  record;
  v_was      text;
  v_now      timestamptz := now();
  v_result   jsonb;
begin
  -- Admin gate (defense in depth; the edge fn also assertAdmin's).
  select is_admin into v_is_admin from public.users where id = p_admin_id;
  if not found or not coalesce(v_is_admin, false) then
    raise exception 'NOT_ADMIN';
  end if;

  select id, order_id, livreur_id, status
    into v_delivery
    from public.deliveries
    where id = p_delivery_id
    for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;

  -- Reassignable states only — never reopen a completed/cancelled delivery.
  if v_delivery.status not in ('unassigned', 'assigned', 'in_transit') then
    raise exception 'INVALID_DELIVERY_STATUS';
  end if;

  select id, status, events
    into v_order
    from public.orders
    where id = v_delivery.order_id
    for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  -- Escrow invariant: only PAID (in escrow) or 'preparing' orders may receive
  -- a livreur — the same gate assign_delivery enforces.
  if v_order.status not in ('paid', 'preparing') then
    raise exception 'INVALID_ORDER_STATUS';
  end if;

  select id, display_name, roles
    into v_livreur
    from public.users
    where id = p_livreur_id;
  if not found then raise exception 'LIVREUR_NOT_FOUND'; end if;
  if not ('livreur' = any(v_livreur.roles)) then
    raise exception 'NOT_A_LIVREUR';
  end if;

  v_was := v_delivery.status;

  update public.deliveries
    set livreur_id  = p_livreur_id,
        status      = 'assigned',
        assigned_at = v_now,
        updated_at  = v_now
    where id = v_delivery.id;

  update public.orders
    set events = v_order.events || jsonb_build_array(
                   jsonb_build_object(
                     'at', v_now,
                     'kind', 'livreur_assigned',
                     'label', case when v_was = 'unassigned'
                                   then 'Livreur assigné' else 'Livreur réassigné' end,
                     'livreur_id', p_livreur_id,
                     'livreur_name', coalesce(v_livreur.display_name, ''),
                     'by_admin', p_admin_id
                   )
                 ),
        updated_at = v_now
    where id = v_order.id;

  select to_jsonb(d.*) into v_result
    from public.deliveries d
    where d.id = v_delivery.id;
  return v_result;
end;
$$;

revoke all on function public.admin_assign_delivery(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_assign_delivery(uuid, uuid, uuid)
  to service_role;
