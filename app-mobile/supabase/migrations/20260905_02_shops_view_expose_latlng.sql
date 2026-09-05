-- shop-get-mine needs lat/lng to (a) fix a real bug — the shop-edit screen
-- resets the map to "no pin" on every open because these endpoints never
-- returned the saved point — and (b) let the app tell a real pin apart from
-- the city-centroid fallback (geo_is_pinned), so it can nudge sellers whose
-- boutique/agence isn't actually pinned yet.
--
-- shops_with_counts enumerates its columns explicitly (no `select *`), so a
-- plain ADD COLUMN on shops doesn't surface here — same situation already
-- noted in 20260701_04_shop_opening_hours.sql for opening_hours.
--
-- lat/lng stay OWNER-only in the app: only shop-get-mine's edge function
-- selects them from this view. The public get-shop/list-shops endpoints
-- keep their existing explicit column lists untouched, so a shop's exact
-- point still never reaches a buyer (same reasoning as delivery-quote never
-- returning raw distance, to avoid trilateration).
--
-- New column appended at the end — CREATE OR REPLACE VIEW cannot reorder
-- existing ones. security_invoker=on preserved from the 2026-07-29 hardening.
create or replace view public.shops_with_counts
with (security_invoker = on) as
  select
    s.id,
    s.owner_id,
    s.name,
    s.about,
    s.city,
    s.cover_url,
    s.avatar_url,
    s.verified,
    s.rating,
    s.review_count,
    s.follower_count,
    s.response_time_text,
    s.created_at,
    s.updated_at,
    (coalesce(p.cnt, 0::bigint))::integer as product_count,
    s.opening_hours,
    s.kind,
    (coalesce(r.cnt, 0::bigint))::integer as property_count,
    s.lat,
    s.lng
  from public.shops s
  left join (
    select products.shop_id, count(*) as cnt
      from public.products
     where products.status = 'active'
     group by products.shop_id
  ) p on p.shop_id = s.id
  left join (
    select properties.shop_id, count(*) as cnt
      from public.properties
     where properties.status = 'active'
     group by properties.shop_id
  ) r on r.shop_id = s.id;
