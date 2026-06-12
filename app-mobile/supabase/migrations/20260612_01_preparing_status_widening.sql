-- Phase X.9 — widen confirm_order_receipt + dispute_order status gates to
-- include 'preparing'.
--
-- WHY : X.6b shipped /set-order-tracking, which flips paid orders to
-- 'preparing'. The two RPCs above were authored before the 'preparing' state
-- existed (status had only 'paid' / 'delivered' on the post-pay side) and
-- their `status not in ('paid','delivered')` rejection list now bricks the
-- happy path : a buyer scanning the QR after the seller marks the package
-- shipped, OR a buyer filing a dispute on a shipped-but-not-yet-arrived
-- order, gets INVALID_STATUS. Escrow funds stay locked.
--
-- Fix : re-create both RPCs verbatim with 'preparing' added to the accept
-- list. Re-validated post-apply via pg_get_functiondef grep for 'preparing'.
-- No other RPC needs this widening : resolve_dispute reads orders.status
-- without filtering it (admin can resolve from any status the dispute flow
-- got it into), and set-order-tracking itself transitions FROM 'paid' only.
--
-- The function bodies below are identical to 20260531_05_confirm_order_receipt.sql
-- and 20260531_06_dispute_order.sql except for the one-line gate change.

create or replace function public.confirm_order_receipt(
  p_order_id  uuid,
  p_caller_id uuid
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
  select id, buyer_id, seller_id, amount_minor, fees_minor, status, events
    into v_order
    from public.orders
    where id = p_order_id
    for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if v_order.buyer_id <> p_caller_id then
    raise exception 'ORDER_NOT_BUYER';
  end if;

  if v_order.status not in ('paid', 'preparing', 'delivered') then
    raise exception 'INVALID_STATUS';
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


create or replace function public.dispute_order(
  p_order_id  uuid,
  p_caller_id uuid,
  p_reason    text,
  p_note      text
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_order record;
  v_now   timestamptz := now();
  v_event jsonb;
begin
  if p_reason not in ('damaged', 'wrong', 'not_received') then
    raise exception 'INVALID_REASON';
  end if;

  select id, buyer_id, status, events
    into v_order
    from public.orders
    where id = p_order_id
    for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if v_order.buyer_id <> p_caller_id then
    raise exception 'ORDER_NOT_BUYER';
  end if;

  if v_order.status not in ('paid', 'preparing', 'delivered') then
    raise exception 'INVALID_STATUS';
  end if;

  v_event := jsonb_build_object(
    'at',     v_now,
    'label',  'Litige ouvert',
    'reason', p_reason,
    'note',   nullif(p_note, '')
  );

  update public.orders
    set status = 'disputed',
        events = v_order.events || jsonb_build_array(v_event),
        updated_at = v_now
    where id = v_order.id;
end;
$$;
