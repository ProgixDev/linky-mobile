-- 2026-06-25: real geo-coordinates (quartier / ville level) for the delivery map.
-- Today nothing has coords: shops have only `city`, deliveries.gps_* are empty,
-- buyer addresses are text. This adds a city/district -> centroid lookup, backfills
-- shops + buyer addresses + deliveries, and auto-sets coords on every NEW shop /
-- address / delivery via triggers (so it works for new products and new orders).

-- 1. Centroid reference: lowercased city/district name -> coordinate.
create table if not exists public.geo_centroids (
  name text primary key,
  lat  double precision not null,
  lng  double precision not null
);

insert into public.geo_centroids(name, lat, lng) values
  ('conakry',     9.5350, -13.6800),
  ('kaloum',      9.5092, -13.7122),
  ('dixinn',      9.5370, -13.6785),
  ('matam',       9.5260, -13.6620),
  ('ratoma',      9.5870, -13.6400),
  ('matoto',      9.5850, -13.6100),
  ('mamou',      10.3755, -12.0914),
  ('kindia',     10.0569, -12.8657),
  ('boke',       10.9400, -14.3000),
  ('kankan',     10.3850,  -9.3060),
  ('labe',       11.3180, -12.2830),
  ('nzerekore',   7.7562,  -8.8179),
  ('faranah',    10.0404, -10.7430),
  ('kissidougou', 9.1850, -10.0990),
  ('siguiri',    11.4147,  -9.1700)
on conflict (name) do nothing;

-- 2. Resolve coords: prefer the district (more specific), then the city, then a
--    Conakry default. Accent-free keys; unknown sub-areas fall through to the city.
create or replace function public.geo_centroid(p_city text, p_district text)
returns table(lat double precision, lng double precision)
language sql
stable
set search_path = ''
as $$
  select coalesce(d.lat, c.lat, 9.5350)  as lat,
         coalesce(d.lng, c.lng, -13.6800) as lng
  from (select 1) one
  left join public.geo_centroids d on d.name = lower(btrim(coalesce(p_district, '')))
  left join public.geo_centroids c on c.name = lower(btrim(coalesce(p_city, '')));
$$;

-- 3. shops (seller / boutique pickup point) -- add coords, backfill, auto-set.
alter table public.shops add column if not exists lat double precision;
alter table public.shops add column if not exists lng double precision;

update public.shops s
  set (lat, lng) = (select lat, lng from public.geo_centroid(s.city, null))
  where s.lat is null;

create or replace function public.shops_set_geo()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.lat is null or new.lng is null then
    select lat, lng into new.lat, new.lng from public.geo_centroid(new.city, null);
  end if;
  return new;
end; $$;
drop trigger if exists shops_set_geo_trg on public.shops;
create trigger shops_set_geo_trg before insert or update of city on public.shops
  for each row execute function public.shops_set_geo();

-- 4. addresses (buyer delivery address) -- add coords, backfill, auto-set.
alter table public.addresses add column if not exists lat double precision;
alter table public.addresses add column if not exists lng double precision;

update public.addresses a
  set (lat, lng) = (select lat, lng from public.geo_centroid(a.city, a.district))
  where a.lat is null;

create or replace function public.addresses_set_geo()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.lat is null or new.lng is null then
    select lat, lng into new.lat, new.lng from public.geo_centroid(new.city, new.district);
  end if;
  return new;
end; $$;
drop trigger if exists addresses_set_geo_trg on public.addresses;
create trigger addresses_set_geo_trg before insert or update of city, district on public.addresses
  for each row execute function public.addresses_set_geo();

-- 5. deliveries (client drop-off point) -- backfill gps from the buyer address (the
--    accurate source) then the embedded delivery_address, and auto-set on new rows.
update public.deliveries d
  set gps_lat = a.lat, gps_lng = a.lng
  from public.addresses a
  where (d.delivery_address->>'address_id')::uuid = a.id
    and d.gps_lat is null and a.lat is not null;

update public.deliveries d
  set (gps_lat, gps_lng) = (
    select lat, lng from public.geo_centroid(d.delivery_address->>'city', d.delivery_address->>'district')
  )
  where d.gps_lat is null;

create or replace function public.deliveries_set_geo()
returns trigger language plpgsql set search_path = '' as $$
declare aid uuid;
begin
  if new.gps_lat is null or new.gps_lng is null then
    aid := nullif(new.delivery_address->>'address_id', '')::uuid;
    if aid is not null then
      select lat, lng into new.gps_lat, new.gps_lng from public.addresses where id = aid;
    end if;
    if new.gps_lat is null then
      select lat, lng into new.gps_lat, new.gps_lng
        from public.geo_centroid(new.delivery_address->>'city', new.delivery_address->>'district');
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists deliveries_set_geo_trg on public.deliveries;
create trigger deliveries_set_geo_trg before insert on public.deliveries
  for each row execute function public.deliveries_set_geo();
