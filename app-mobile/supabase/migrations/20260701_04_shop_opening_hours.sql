-- Boutique opening hours — owner-configured schedule, surfaced client-side as a
-- dynamic "Ouvert / Fermé" status and a "24/24h" badge on the storefront.
--
-- Nullable jsonb so every existing shop (no hours set) simply shows no badge.
-- Shape written by shop-upsert:
--   { "always_open": bool, "days": ["mon","tue",...], "open": "HH:MM", "close": "HH:MM" }
-- days use lowercase 3-letter English codes (mon..sun); when always_open is true
-- the days/open/close fields are ignored by the client.
alter table public.shops
  add column if not exists opening_hours jsonb;

-- shops_with_counts enumerates its columns explicitly, so a plain ADD COLUMN on
-- the base table isn't picked up. Recreate the view. CREATE OR REPLACE VIEW only
-- permits NEW columns appended at the END of the select list — opening_hours goes
-- last, after product_count, so the replace is accepted.
create or replace view public.shops_with_counts as
  select
    s.id, s.owner_id, s.name, s.about, s.city,
    s.cover_url, s.avatar_url, s.verified, s.rating,
    s.review_count, s.follower_count, s.response_time_text,
    s.created_at, s.updated_at,
    coalesce(p.cnt, 0)::int as product_count,
    s.opening_hours
  from public.shops s
  left join (
    select shop_id, count(*) as cnt
    from public.products
    where status = 'active'
    group by shop_id
  ) p on p.shop_id = s.id;
