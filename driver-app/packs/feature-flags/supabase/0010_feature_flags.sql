-- feature-flags — remote on/off switches + percentage rollout. Public-read so
-- the client can evaluate flags before/without auth. You edit rows from the
-- dashboard; there is no client write policy.

create table public.feature_flags (
  key text primary key check (key ~ '^[a-z0-9_]+$'),
  enabled boolean not null default false,
  -- 0..100: when enabled, the share of users who get it (deterministic per user).
  rollout integer not null default 100 check (rollout between 0 and 100),
  description text,
  updated_at timestamptz not null default now()
);

grant select on public.feature_flags to anon, authenticated;
create policy "feature_flags: public read" on public.feature_flags
  for select to anon, authenticated
  using (true);
