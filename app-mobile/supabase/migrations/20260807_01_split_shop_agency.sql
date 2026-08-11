-- Dissocier « Boutique » et « Agence Immo » (client 2026-08-07).
--
-- Until now ONE shops row served as both the user's boutique (for products)
-- AND their real-estate agency (for properties) — same name, logo, cover and
-- reviews for both. Real data showed why that breaks: a profile literally
-- named « XYZ Agence immo » was also the seller shown on a clothing product.
--
-- A user can now own one profile PER KIND: a 'shop' for products and an
-- 'agency' for properties, each with its own branding.

alter table public.shops
  add column if not exists kind text not null default 'shop';

alter table public.shops
  drop constraint if exists shops_kind_check;
alter table public.shops
  add constraint shops_kind_check check (kind in ('shop', 'agency'));

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Case A — the profile only ever held properties: it IS the agency, relabel in
-- place so nothing moves and the owner keeps their branding.
update public.shops s
   set kind = 'agency'
 where exists (select 1 from public.properties r where r.shop_id = s.id)
   and not exists (select 1 from public.products p where p.shop_id = s.id);

-- Case B — the profile held BOTH: the original stays the boutique (its
-- products don't move), and a NEW agency is created carrying the same branding
-- as a starting point; the owner renames it afterwards. Every property is
-- re-pointed at that agency.
do $$
declare
  r          record;
  v_agency   uuid;
begin
  for r in
    select s.id, s.owner_id, s.name, s.about, s.city, s.cover_url, s.avatar_url
      from public.shops s
     where exists (select 1 from public.properties p where p.shop_id = s.id)
       and exists (select 1 from public.products  p where p.shop_id = s.id)
  loop
    insert into public.shops (owner_id, name, about, city, cover_url, avatar_url, kind)
    values (r.owner_id, r.name, r.about, r.city, r.cover_url, r.avatar_url, 'agency')
    returning id into v_agency;

    update public.properties set shop_id = v_agency where shop_id = r.id;
  end loop;
end $$;

-- One profile per (owner, kind). Also makes the "resolve my shop" queries in
-- product-create / property-create unambiguous — they used to pick the OLDEST
-- shop, which is exactly how properties ended up under a boutique.
create unique index if not exists shops_owner_kind_uniq
  on public.shops (owner_id, kind);

-- ── View ────────────────────────────────────────────────────────────────────
-- Expose `kind` so the app can tell the two apart, and `property_count` so an
-- agency page can show a meaningful figure (product_count is always 0 there).
-- New columns are APPENDED — CREATE OR REPLACE VIEW cannot reorder existing
-- ones. security_invoker=on is preserved from the 2026-07-29 hardening.
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
    (coalesce(r.cnt, 0::bigint))::integer as property_count
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
