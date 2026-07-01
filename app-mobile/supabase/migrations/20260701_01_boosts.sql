-- Boost module — paid listing visibility for shop products.
-- The catalog migration (20260529_03) shipped products.boosted as a static
-- boolean and flagged "boost is a later module"; this is that module.
--
-- Flow: seller pays a flat per-duration fee from their GNF wallet →
-- platform wallet (system_platform, ...0002), and the product surfaces first
-- in the marketplace browse (list-products) for the boost window. The whole
-- purchase is one atomic RPC (purchase_boost) so money never moves without a
-- boost row, mirroring place_order / confirm_order_receipt.

-- ─── 1. Schema ──────────────────────────────────────────────────────────────
-- boosted_until drives expiry + the "expires in X" display. The existing
-- products.boosted boolean stays the live surfacing flag (flipped off by the
-- hourly sweep once the window closes) so list-products keeps its cheap
-- boolean sort with no join.
alter table public.products
  add column if not exists boosted_until timestamptz;

create index if not exists products_boosted_idx
  on public.products(boosted_until desc) where boosted;

-- One row per purchase — the seller's boost history + audit trail.
create table if not exists public.boosts (
  id           uuid primary key default public.uuidv7(),
  product_id   uuid not null references public.products(id) on delete cascade,
  seller_id    uuid not null references public.users(id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  days         int not null check (days > 0),
  status       text not null default 'active'
               check (status in ('active','expired','cancelled')),
  ref_id       uuid not null,           -- shared with the ledger transfer pair
  starts_at    timestamptz not null default now(),
  ends_at      timestamptz not null,
  created_at   timestamptz not null default now()
);
create index if not exists boosts_seller_idx on public.boosts(seller_id, created_at desc);
create index if not exists boosts_product_idx on public.boosts(product_id);
create index if not exists boosts_active_idx on public.boosts(status, ends_at) where status = 'active';
alter table public.boosts enable row level security;
-- No public policies: reads/writes happen via edge functions (service_role).

-- ─── 2. purchase_boost() — atomic buy ──────────────────────────────────────
-- Validates ownership + active status under a row lock, moves money
-- seller→platform (post_transfer raises INSUFFICIENT_FUNDS → whole tx rolls
-- back), records the boost, and flips the product's surfacing flag. Stacking:
-- paying again while a boost is live EXTENDS the window rather than resetting.
create or replace function public.purchase_boost(
  p_product_id   uuid,
  p_seller_id    uuid,
  p_days         int,
  p_amount_minor bigint
)
returns public.boosts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner            uuid;
  v_status           text;
  v_boosted_until    timestamptz;
  v_seller_wallet    uuid;
  v_platform_wallet  uuid;
  v_ref_id           uuid := public.uuidv7();
  v_ends_at          timestamptz;
  v_boost            public.boosts;
begin
  if p_days <= 0 or p_amount_minor <= 0 then
    raise exception 'INVALID_INPUT';
  end if;

  -- Lock the product row; verify it's the caller's and still active.
  select s.owner_id, p.status, p.boosted_until
    into v_owner, v_status, v_boosted_until
  from public.products p
  join public.shops s on s.id = p.shop_id
  where p.id = p_product_id
  for update of p;

  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if v_owner <> p_seller_id then raise exception 'NOT_OWNER'; end if;
  if v_status <> 'active' then raise exception 'PRODUCT_NOT_ACTIVE'; end if;

  select id into v_seller_wallet
    from public.wallets where user_id = p_seller_id and currency = 'GNF';
  if v_seller_wallet is null then raise exception 'SELLER_WALLET_NOT_FOUND'; end if;

  select id into v_platform_wallet
    from public.wallets
    where user_id = '00000000-0000-0000-0000-000000000002' and currency = 'GNF';
  if v_platform_wallet is null then raise exception 'PLATFORM_WALLET_NOT_FOUND'; end if;

  -- Money: seller → platform. Rolls the whole tx back on INSUFFICIENT_FUNDS.
  perform public.post_transfer(
    v_seller_wallet, v_platform_wallet, p_amount_minor, 'boost_purchase', v_ref_id
  );

  v_ends_at := greatest(now(), coalesce(v_boosted_until, now())) + make_interval(days => p_days);

  insert into public.boosts (product_id, seller_id, amount_minor, days, ref_id, starts_at, ends_at)
    values (p_product_id, p_seller_id, p_amount_minor, p_days, v_ref_id, now(), v_ends_at)
    returning * into v_boost;

  update public.products
     set boosted = true, boosted_until = v_ends_at
   where id = p_product_id;

  return v_boost;
end;
$$;
revoke all on function public.purchase_boost(uuid, uuid, int, bigint) from public, anon, authenticated;
grant execute on function public.purchase_boost(uuid, uuid, int, bigint) to service_role;

-- ─── 3. expire_boosts() + hourly sweep ──────────────────────────────────────
-- Flips products off + marks boosts expired once the window closes. The badge
-- is driven off products.boosted, so worst-case lag before a stale badge
-- clears is one hour.
create or replace function public.expire_boosts()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.boosts
     set status = 'expired'
   where status = 'active' and ends_at < now();
  update public.products
     set boosted = false, boosted_until = null
   where boosted and (boosted_until is null or boosted_until < now());
$$;
revoke all on function public.expire_boosts() from public, anon, authenticated;
grant execute on function public.expire_boosts() to service_role;

-- pg_cron 1.6.4 is already installed (see 20260528_04_cleanup_cron).
do $$
begin
  perform cron.unschedule('linky-expire-boosts');
exception
  when others then null;
end $$;
select cron.schedule(
  'linky-expire-boosts',
  '7 * * * *',   -- hourly at :07
  $$ select public.expire_boosts(); $$
);
