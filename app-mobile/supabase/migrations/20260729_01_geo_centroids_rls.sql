-- Security fix (2026-07-29): geo_centroids was the ONLY public table without
-- Row-Level Security, so the anon key could read/edit/DELETE it directly via
-- PostgREST (Supabase security advisor: rls_disabled_in_public). It holds public
-- geo reference data (city/region centroids) — nothing personal — but leaving it
-- writable let anyone corrupt the coordinates.
--
-- Fix: enable RLS + a public read-only policy. Reads stay open (the data is
-- public reference data); anon INSERT/UPDATE/DELETE is blocked. Edge functions
-- use the service role, which bypasses RLS, so nothing in the app breaks.
--
-- Applied to prod (mkaddhcjneilvwqethjo) via the Management API on 2026-07-29.
alter table public.geo_centroids enable row level security;
drop policy if exists "geo_centroids_public_read" on public.geo_centroids;
create policy "geo_centroids_public_read" on public.geo_centroids for select using (true);
