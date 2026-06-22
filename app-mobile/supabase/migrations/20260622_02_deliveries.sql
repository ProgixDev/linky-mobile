-- Phase LIVREUR.2 — deliveries table + assign + the INVERTED-QR confirm.
--
-- Decision (client meeting 2026-06-21) : flip the QR handoff. Before this,
-- the seller printed a QR on the package and the BUYER scanned it
-- (confirm_order_receipt). Now : the CLIENT (buyer) shows the order QR
-- ON-SCREEN, and the LIVREUR scans it at handoff. The livreur's scan IS
-- the receipt confirmation : same escrow release semantics as
-- confirm_order_receipt, just a different gate (assigned livreur instead
-- of order buyer). The old path stays installed for hand-carry / no-livreur
-- orders ; the two confirms are mutually exclusive on the same order via
-- the status gate (both reject anything past 'delivered'/'released').
--
-- A `deliveries` row is auto-created at order placement (status='unassigned',
-- delivery_address snapshotted) so the seller can pick a livreur to assign.
-- Snapshotting freezes the destination at order time : changing the buyer's
-- default address later does NOT redirect a paid package.
--
-- All RPCs are service-role only and called from edge fns (delivery-assign,
-- livreur-confirm-handoff). RLS on the table is enabled with NO policies
-- → service-role bypasses RLS, every authed client must go through the fns.

-- ===========================================================================
-- 1. deliveries table
-- ===========================================================================
create table if not exists public.deliveries (
  id                uuid primary key default public.uuidv7(),
  order_id          uuid not null unique references public.orders(id) on delete cascade,
  livreur_id        uuid references public.users(id) on delete set null,
  status            text not null default 'unassigned'
                      check (status in ('unassigned','assigned','in_transit','delivered','failed','cancelled')),
  delivery_address  jsonb,
  assigned_at       timestamptz,
  pickup_at         timestamptz,
  delivered_at      timestamptz,
  gps_lat           numeric(10,6),
  gps_lng           numeric(10,6),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists deliveries_livreur_status_created_idx
  on public.deliveries (livreur_id, status, created_at desc);
create index if not exists deliveries_status_idx
  on public.deliveries (status);

alter table public.deliveries enable row level security;
-- No public policies: write/read paths run as service_role after requireUser().

-- ===========================================================================
-- 2. Backfill : every existing order gets a deliveries row (unassigned).
--    delivery_address pulled from the buyer's default address if any ; null
--    otherwise (the seller fills it in when assigning the livreur).
--    Released/cancelled orders also get a row so admin / livreur history
--    queries are consistent ; they just stay 'unassigned' forever.
-- ===========================================================================
insert into public.deliveries (order_id, delivery_address, status)
select
  o.id,
  case when a.id is null then null else
    jsonb_build_object(
      'address_id', a.id,
      'label',      a.label,
      'city',       a.city,
      'district',   a.district,
      'details',    a.details
    )
  end,
  'unassigned'
from public.orders o
left join lateral (
  select id, label, city, district, details
  from public.addresses
  where user_id = o.buyer_id and is_default = true
  limit 1
) a on true
left join public.deliveries d on d.order_id = o.id
where d.id is null;

-- ===========================================================================
-- 3. place_order : auto-create a deliveries row on order placement.
--    Done as an AFTER INSERT trigger on public.orders so every place_order
--    branch (wallet/lengopay/stripe) lands a deliveries row without having
--    to thread the snapshot through three RPC variants.
-- ===========================================================================
create or replace function public.create_delivery_for_new_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_addr record;
begin
  -- Snapshot the buyer's default address (if any) at order creation time.
  -- Address changes after this point do NOT redirect the package — escrow
  -- depends on a deterministic delivery destination.
  select id, label, city, district, details
    into v_addr
    from public.addresses
    where user_id = new.buyer_id and is_default = true
    limit 1;

  insert into public.deliveries (order_id, delivery_address, status)
  values (
    new.id,
    case when v_addr.id is null then null else
      jsonb_build_object(
        'address_id', v_addr.id,
        'label',      v_addr.label,
        'city',       v_addr.city,
        'district',   v_addr.district,
        'details',    v_addr.details
      )
    end,
    'unassigned'
  )
  on conflict (order_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_create_delivery_for_new_order on public.orders;
create trigger trg_create_delivery_for_new_order
  after insert on public.orders
  for each row execute function public.create_delivery_for_new_order();

-- ===========================================================================
-- 4. assign_delivery(p_order_id, p_livreur_id, p_caller_id)
--    Caller MUST be the seller of that order (admin will go through a
--    separate path later). p_livreur_id MUST be a user with role 'livreur'.
--    Transitions delivery_status : unassigned/failed/cancelled → assigned.
--    Cannot re-assign a delivery that's already 'delivered'.
-- ===========================================================================
create or replace function public.assign_delivery(
  p_order_id   uuid,
  p_livreur_id uuid,
  p_caller_id  uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order     record;
  v_delivery  record;
  v_livreur   record;
  v_now       timestamptz := now();
begin
  select id, seller_id, status, events
    into v_order
    from public.orders
    where id = p_order_id
    for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if v_order.seller_id <> p_caller_id then
    raise exception 'NOT_ORDER_SELLER';
  end if;

  -- Only orders that are PAID (in escrow) or in 'preparing' may be assigned.
  -- Pre-payment (placed) means no money in escrow yet — assigning a livreur
  -- to a rail-pending order is meaningless. Post-handoff statuses are
  -- terminal for the delivery.
  if v_order.status not in ('paid', 'preparing') then
    raise exception 'INVALID_STATUS';
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
$$;

-- ===========================================================================
-- 5. livreur_confirm_handoff(p_order_id, p_livreur_id, p_scan_token)
--    THE INVERTED CONFIRM. The livreur scans the CLIENT's on-screen QR ;
--    the QR carries the order's scan_token. Match the token, then release
--    escrow exactly like confirm_order_receipt (escrow→seller amount,
--    escrow→platform fees, orders.status='released').
--
--    Gates :
--      - delivery exists for the order,
--      - delivery.livreur_id = p_livreur_id (assigned livreur only),
--      - order.scan_token = p_scan_token (the QR secret on the client's screen),
--      - order.status ∈ ('paid','preparing') — same gate as
--        confirm_order_receipt, minus 'delivered' which would skip
--        deliveries.delivered_at bookkeeping.
--
--    The two confirm paths (this one + confirm_order_receipt) are mutually
--    exclusive on a given order : whichever fires first flips status to
--    'released' and the other one trips INVALID_STATUS.
-- ===========================================================================
create or replace function public.livreur_confirm_handoff(
  p_order_id   uuid,
  p_livreur_id uuid,
  p_scan_token uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order               record;
  v_delivery            record;
  v_seller_wallet_id    uuid;
  v_escrow_wallet_id    uuid;
  v_platform_wallet_id  uuid;
  v_now                 timestamptz := now();
begin
  -- Lock the order first ; scan_token check matches confirm_order_receipt's
  -- ordering : buyer/livreur identity → status → token, so we never leak
  -- token validity to an unrelated caller.
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

  if v_order.status not in ('paid', 'preparing') then
    raise exception 'INVALID_STATUS';
  end if;

  if v_delivery.status not in ('assigned', 'in_transit') then
    -- Already delivered/failed/cancelled at the delivery layer ; surface
    -- so the livreur app shows the right toast instead of "scan ok".
    raise exception 'INVALID_DELIVERY_STATUS';
  end if;

  if v_order.scan_token is null or v_order.scan_token <> p_scan_token then
    raise exception 'INVALID_SCAN_TOKEN';
  end if;

  -- Idempotent wallet creation for seller (mirrors confirm_order_receipt).
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
$$;

-- ===========================================================================
-- 6. Permissions : service-role only on both RPCs.
-- ===========================================================================
revoke all on function public.assign_delivery(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.assign_delivery(uuid, uuid, uuid)
  to service_role;

revoke all on function public.livreur_confirm_handoff(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.livreur_confirm_handoff(uuid, uuid, uuid)
  to service_role;

revoke all on function public.create_delivery_for_new_order()
  from public, anon, authenticated;
grant execute on function public.create_delivery_for_new_order()
  to service_role;
