-- ============================================================================
-- Security fixes (2026-07-29) — from the adversarial audit of the same day.
-- Apply on prod (mkaddhcjneilvwqethjo) via the SQL Editor.
--
-- All four functions are CREATE OR REPLACE with UNCHANGED signatures, so the
-- EXECUTE grants revoked from anon/authenticated/public on 2026-07-29
-- (20260729_02) are PRESERVED. Nothing here re-opens them.
-- ============================================================================

-- ── CRITICAL: escrow self-release (LINKY-ESCROW-SELF-RELEASE) ───────────────
-- A seller who also holds the 'livreur' role could assign THEMSELVES as the
-- order's livreur, read their own order's scan_token (the seller is served it),
-- and confirm handoff to release escrow to their own wallet WITHOUT the buyer
-- ever receiving the goods — and the buyer can't dispute a 'released' order.
-- Fix: the delivery agent may never be the order's seller (or buyer). Enforced
-- in assign_delivery + admin_assign_delivery, with a defense-in-depth block at
-- release time in livreur_confirm_handoff.

create or replace function public.assign_delivery(p_order_id uuid, p_livreur_id uuid, p_caller_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_order     record;
  v_delivery  record;
  v_livreur   record;
  v_now       timestamptz := now();
begin
  select id, seller_id, buyer_id, status, events
    into v_order
    from public.orders
    where id = p_order_id
    for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if v_order.seller_id <> p_caller_id then
    raise exception 'NOT_ORDER_SELLER';
  end if;

  if v_order.status not in ('paid', 'preparing') then
    raise exception 'INVALID_STATUS';
  end if;

  -- Escrow-release integrity: the delivery agent must be a third party, never
  -- the order's own seller or buyer. Otherwise a seller who also holds the
  -- livreur role could self-assign and self-release the escrow.
  if p_livreur_id = v_order.seller_id or p_livreur_id = v_order.buyer_id then
    raise exception 'LIVREUR_IS_COUNTERPARTY';
  end if;

  select id, display_name, roles
    into v_livreur
    from public.users
    where id = p_livreur_id;
  if not found then raise exception 'LIVREUR_NOT_FOUND'; end if;
  if not ('livreur' = any(v_livreur.roles)) then
    raise exception 'NOT_A_LIVREUR';
  end if;

  select id, status into v_delivery
    from public.deliveries
    where order_id = p_order_id
    for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;

  if v_delivery.status = 'delivered' then
    raise exception 'DELIVERY_ALREADY_COMPLETED';
  end if;

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
                     'label', 'Livreur assigné',
                     'livreur_id', p_livreur_id,
                     'livreur_name', coalesce(v_livreur.display_name, '')
                   )
                 ),
        updated_at = v_now
    where id = p_order_id;
end;
$function$;

create or replace function public.admin_assign_delivery(p_delivery_id uuid, p_livreur_id uuid, p_admin_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_is_admin boolean;
  v_delivery record;
  v_order    record;
  v_livreur  record;
  v_was      text;
  v_now      timestamptz := now();
  v_result   jsonb;
begin
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

  if v_delivery.status not in ('unassigned', 'assigned', 'in_transit') then
    raise exception 'INVALID_DELIVERY_STATUS';
  end if;

  select id, seller_id, buyer_id, status, events
    into v_order
    from public.orders
    where id = v_delivery.order_id
    for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if v_order.status not in ('paid', 'preparing') then
    raise exception 'INVALID_ORDER_STATUS';
  end if;

  -- Same escrow-release integrity guard as assign_delivery: never the order's
  -- own seller or buyer.
  if p_livreur_id = v_order.seller_id or p_livreur_id = v_order.buyer_id then
    raise exception 'LIVREUR_IS_COUNTERPARTY';
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
$function$;

create or replace function public.livreur_confirm_handoff(p_order_id uuid, p_livreur_id uuid, p_scan_token uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_order               record;
  v_delivery            record;
  v_seller_wallet_id    uuid;
  v_escrow_wallet_id    uuid;
  v_platform_wallet_id  uuid;
  v_now                 timestamptz := now();
begin
  select id, buyer_id, seller_id, amount_minor, fees_minor, status, events, scan_token
    into v_order
    from public.orders
    where id = p_order_id
    for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  select id, livreur_id, status
    into v_delivery
    from public.deliveries
    where order_id = p_order_id
    for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;

  if v_delivery.livreur_id is null or v_delivery.livreur_id <> p_livreur_id then
    raise exception 'NOT_ASSIGNED_LIVREUR';
  end if;

  -- Defense in depth for LINKY-ESCROW-SELF-RELEASE: refuse to release escrow if
  -- the confirming livreur is the order's own seller or buyer, even if a bad
  -- assignment somehow slipped past assign_delivery / admin_assign_delivery.
  if v_delivery.livreur_id = v_order.seller_id or v_delivery.livreur_id = v_order.buyer_id then
    raise exception 'LIVREUR_IS_COUNTERPARTY';
  end if;

  if v_order.status not in ('paid', 'preparing') then
    raise exception 'INVALID_STATUS';
  end if;

  if v_delivery.status not in ('assigned', 'in_transit') then
    raise exception 'INVALID_DELIVERY_STATUS';
  end if;

  if v_order.scan_token is null or v_order.scan_token <> p_scan_token then
    raise exception 'INVALID_SCAN_TOKEN';
  end if;

  insert into public.wallets (user_id, currency)
    values (v_order.seller_id, 'GNF')
    on conflict (user_id, currency) do nothing;

  select id into v_seller_wallet_id
    from public.wallets
    where user_id = v_order.seller_id and currency = 'GNF';

  select id into v_escrow_wallet_id
    from public.wallets
    where user_id = '00000000-0000-0000-0000-000000000001' and currency = 'GNF';

  select id into v_platform_wallet_id
    from public.wallets
    where user_id = '00000000-0000-0000-0000-000000000002' and currency = 'GNF';

  perform public.post_transfer(
    v_escrow_wallet_id, v_seller_wallet_id, v_order.amount_minor,
    'order_release', v_order.id
  );
  perform public.post_transfer(
    v_escrow_wallet_id, v_platform_wallet_id, v_order.fees_minor,
    'order_platform_fee', v_order.id
  );

  update public.deliveries
    set status       = 'delivered',
        delivered_at = v_now,
        updated_at   = v_now
    where id = v_delivery.id;

  update public.orders
    set status = 'released',
        events = v_order.events || jsonb_build_array(
                   jsonb_build_object('at', v_now, 'kind', 'delivered',
                                       'label', 'Livraison confirmée',
                                       'livreur_id', p_livreur_id),
                   jsonb_build_object('at', v_now, 'label', 'Réception confirmée')
                 ),
        updated_at = v_now
    where id = v_order.id;
end;
$function$;

-- ── HIGH: email account pre-hijacking (AUTH-03) ─────────────────────────────
-- email-signup sets a password WITHOUT proving email ownership (verified_at is
-- left NULL). An attacker could pre-register a victim's email; when the victim
-- later signs in via email-OTP, the old code silently reused that account and
-- the attacker's password kept working on it.
-- Fix: OTP proves control. If the address was previously UNVERIFIED, mark it
-- verified now AND invalidate any pre-existing password + sessions (they were
-- set before ownership was ever proven, so they are untrusted). otp-verify
-- inserts the caller's fresh session AFTER this runs, so the legitimate owner
-- stays logged in.

create or replace function public.find_or_create_user_with_email(p_address text)
 returns table(id uuid, was_created boolean)
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  found_user_id uuid;
  new_user_id uuid;
  v_was_unverified boolean := false;
begin
  select e.user_id, (e.verified_at is null)
    into found_user_id, v_was_unverified
    from public.emails e where e.address = p_address;
  if found_user_id is not null then
    if v_was_unverified then
      update public.emails set verified_at = now()
        where user_id = found_user_id and address = p_address;
      update public.users set password_hash = null
        where id = found_user_id and password_hash is not null;
      delete from public.sessions where user_id = found_user_id;
    end if;
    return query select found_user_id, false;
    return;
  end if;

  begin
    insert into public.users default values returning users.id into new_user_id;
    insert into public.emails (user_id, address, is_primary, verified_at)
      values (new_user_id, p_address, true, now());
    return query select new_user_id, true;
  exception
    when unique_violation then
      select e.user_id into found_user_id from public.emails e where e.address = p_address;
      if found_user_id is null then raise; end if;
      return query select found_user_id, false;
  end;
end;
$function$;
