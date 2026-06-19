-- Phase X.9b — fix the confirm_order_receipt overload regression.
--
-- WHY: 20260612_01 set out to widen the status gate to include 'preparing'
-- (so a buyer can confirm receipt on a SHIPPED order — set-order-tracking
-- flips paid → preparing). But it authored a 2-arg overload
-- confirm_order_receipt(uuid, uuid), dropping the p_scan_token parameter +
-- the INVALID_SCAN_TOKEN gate that 20260601_03 added on the 3-arg signature.
-- Postgres kept BOTH overloads. The confirm-receipt edge fn always calls
-- with 3 args, so PostgREST resolves to the OLD 3-arg overload — which still
-- rejects 'preparing'. Net effect:
--   1. the 'preparing' widening never took effect → escrow stays LOCKED on
--      shipped orders (buyer hits INVALID_STATUS on the QR hold-confirm), and
--   2. a token-less 2-arg overload is left dangling — a QR-gate bypass hazard
--      (release escrow with no scan_token), unreachable from the app today but
--      latent.
--
-- FIX: drop the dangling 2-arg overload, and CREATE OR REPLACE the real 3-arg
-- overload with 'preparing' added to the status gate. Identical to
-- 20260601_03 except the one-line gate change. scan_token gate + the
-- service_role-only grant are preserved.

drop function if exists public.confirm_order_receipt(uuid, uuid);

create or replace function public.confirm_order_receipt(
  p_order_id    uuid,
  p_caller_id   uuid,
  p_scan_token  uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_order               record;
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

  if v_order.buyer_id <> p_caller_id then
    raise exception 'ORDER_NOT_BUYER';
  end if;

  -- Widened gate (X.9) : 'preparing' = seller marked the package shipped.
  if v_order.status not in ('paid', 'preparing', 'delivered') then
    raise exception 'INVALID_STATUS';
  end if;

  -- QR verrou (20260601_03) : sans le bon scan_token, pas de libération.
  -- Après buyer + status checks pour ne pas leak la validité du token ;
  -- avant les wallet lookups pour ne pas créer de wallet seller au passage.
  if v_order.scan_token <> p_scan_token then
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

  update public.orders
    set status = 'released',
        events = v_order.events || jsonb_build_array(
                   jsonb_build_object('at', v_now, 'label', 'Réception confirmée')
                 ),
        updated_at = v_now
    where id = v_order.id;
end;
$$;

revoke all on function public.confirm_order_receipt(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_order_receipt(uuid, uuid, uuid)
  to service_role;
