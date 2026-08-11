-- ============================================================================
-- Property boost (2026-07-29) — extend the paid-visibility "boost" from products
-- to real-estate listings. Client asked for the "Booster une annonce" flow to
-- work in Immobilier, not only in Boutique.
-- Apply on prod (mkaddhcjneilvwqethjo) via the SQL Editor.
-- ============================================================================

-- 1) properties gains the same boost flags products already carry.
alter table public.properties
  add column if not exists boosted boolean not null default false,
  add column if not exists boosted_until timestamptz;

-- 2) boosts becomes polymorphic: exactly one of product_id / property_id.
--    Existing rows all have product_id set → they satisfy the new CHECK.
alter table public.boosts alter column product_id drop not null;
alter table public.boosts
  add column if not exists property_id uuid references public.properties(id) on delete cascade;
alter table public.boosts drop constraint if exists boosts_one_target;
alter table public.boosts
  add constraint boosts_one_target check (num_nonnulls(product_id, property_id) = 1);
create index if not exists boosts_property_id_idx on public.boosts(property_id);

-- 3) properties_with_cover must expose `boosted` so list-properties can order by
--    it. Re-created WITH (security_invoker = on) — that option was set by the
--    2026-07-29 security hardening and must be preserved. New columns appended
--    at the end so CREATE OR REPLACE accepts the change.
create or replace view public.properties_with_cover
  with (security_invoker = on)
as
  select
    p.id, p.owner_id, p.shop_id, p.type, p.title, p.description, p.price_minor,
    p.per_month, p.bedrooms, p.area_sqm, p.furnished, p.amenities, p.city,
    p.district, p.distance_to_road_m, p.lat, p.lng, p.video_url, p.status,
    p.view_count, p.fav_count, p.created_at, p.updated_at,
    pc.url as cover_url,
    coalesce(pp.cnt, 0)::integer as photo_count,
    p.boosted, p.boosted_until
  from public.properties p
  left join lateral (
    select property_photos.url
    from public.property_photos
    where property_photos.property_id = p.id and property_photos."position" = 0
    limit 1
  ) pc on true
  left join (
    select property_photos.property_id, count(*) as cnt
    from public.property_photos
    group by property_photos.property_id
  ) pp on pp.property_id = p.id;

-- 4) purchase_property_boost — mirror of purchase_boost but the owner check is
--    on properties.owner_id directly (no shop join). Same seller→platform
--    wallet debit, same boost row + flag write, same stacking semantics.
create or replace function public.purchase_property_boost(p_property_id uuid, p_seller_id uuid, p_days integer, p_amount_minor bigint)
 returns public.boosts
 language plpgsql
 security definer
 set search_path to ''
as $function$
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

  select pr.owner_id, pr.status, pr.boosted_until
    into v_owner, v_status, v_boosted_until
  from public.properties pr
  where pr.id = p_property_id
  for update of pr;

  if not found then raise exception 'PROPERTY_NOT_FOUND'; end if;
  if v_owner <> p_seller_id then raise exception 'NOT_OWNER'; end if;
  if v_status <> 'active' then raise exception 'PROPERTY_NOT_ACTIVE'; end if;

  select id into v_seller_wallet
    from public.wallets where user_id = p_seller_id and currency = 'GNF';
  if v_seller_wallet is null then raise exception 'SELLER_WALLET_NOT_FOUND'; end if;

  select id into v_platform_wallet
    from public.wallets
    where user_id = '00000000-0000-0000-0000-000000000002' and currency = 'GNF';
  if v_platform_wallet is null then raise exception 'PLATFORM_WALLET_NOT_FOUND'; end if;

  perform public.post_transfer(
    v_seller_wallet, v_platform_wallet, p_amount_minor, 'boost_purchase', v_ref_id
  );

  v_ends_at := greatest(now(), coalesce(v_boosted_until, now())) + make_interval(days => p_days);

  insert into public.boosts (property_id, seller_id, amount_minor, days, ref_id, starts_at, ends_at)
    values (p_property_id, p_seller_id, p_amount_minor, p_days, v_ref_id, now(), v_ends_at)
    returning * into v_boost;

  update public.properties
     set boosted = true, boosted_until = v_ends_at
   where id = p_property_id;

  return v_boost;
end;
$function$;

-- New SECURITY DEFINER fn → Supabase re-grants EXECUTE to anon/authenticated by
-- default; revoke to keep the 2026-07-29 lockdown (the app calls it only via the
-- create-boost edge fn using service_role).
revoke execute on function public.purchase_property_boost(uuid, uuid, integer, bigint) from public, anon, authenticated;

-- 5) expire_boosts also clears the property flags now.
create or replace function public.expire_boosts()
 returns void
 language sql
 security definer
 set search_path to ''
as $function$
  update public.boosts
     set status = 'expired'
   where status = 'active' and ends_at < now();
  update public.products
     set boosted = false, boosted_until = null
   where boosted and (boosted_until is null or boosted_until < now());
  update public.properties
     set boosted = false, boosted_until = null
   where boosted and (boosted_until is null or boosted_until < now());
$function$;
