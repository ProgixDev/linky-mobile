-- app-lifecycle — remote app control. A single public-read config row that you
-- edit from the Supabase dashboard. No secrets here; it is meant to be readable
-- by every client (even signed-out) so the gate can run before auth.

create table public.app_config (
  id boolean primary key default true check (id), -- enforces a single row
  -- Lowest native build number allowed to keep running. Older builds are gated.
  min_supported_build integer not null default 1,
  -- Latest build available (for a soft "update available" nudge).
  latest_build integer not null default 1,
  maintenance boolean not null default false,
  maintenance_message text,
  ios_store_url text,
  android_store_url text,
  updated_at timestamptz not null default now()
);

-- Public read (anon + authenticated). There is intentionally no write policy —
-- only the dashboard / service_role edits this.
grant select on public.app_config to anon, authenticated;
create policy "app_config: public read" on public.app_config
  for select to anon, authenticated
  using (true);

-- Seed the single row.
insert into public.app_config (id) values (true) on conflict (id) do nothing;
