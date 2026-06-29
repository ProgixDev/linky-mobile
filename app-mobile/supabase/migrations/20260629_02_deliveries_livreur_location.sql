-- Live courier position for buyer-side tracking. Distinct from gps_lat/gps_lng
-- (the client DROP-OFF point) — these track where the LIVREUR currently is, pushed
-- periodically by the driver app while en route, read by the buyer's tracking map.
alter table public.deliveries
  add column if not exists livreur_lat double precision,
  add column if not exists livreur_lng double precision,
  add column if not exists livreur_location_at timestamptz;
