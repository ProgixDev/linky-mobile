-- H2 Step C — confirm_order_receipt: buyer marks reception, escrow splits.
-- Verifies caller is buyer + status in ('paid','delivered'), auto-creates
-- the seller's GNF wallet if missing (so a fresh seller doesn't block release),
-- then atomically splits the escrow:
--   escrow_gnf → seller wallet  : amount_minor (ref_type='order_release')
--   escrow_gnf → platform_gnf   : fees_minor   (ref_type='order_platform_fee')
-- Order moves to status='released' with 'Réception confirmée' event appended.

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

  if v_order.status not in ('paid', 'delivered') then
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
