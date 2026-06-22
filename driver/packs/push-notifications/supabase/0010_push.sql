-- push-notifications — per-device Expo push tokens. RLS-first.
-- RLS is auto-enabled on this table by the skeleton's 0001 event trigger.
-- A user may register many devices; each row is owned by exactly one user.

create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The Expo push token (ExponentPushToken[...]). Unique so re-registering upserts.
  token text not null unique check (char_length(token) between 1 and 255),
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.device_tokens to authenticated;
create index device_tokens_user_idx on public.device_tokens (user_id);

-- Owner-scoped policies. (select auth.uid()) is wrapped so the planner caches it.
create policy device_tokens_select_own on public.device_tokens
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy device_tokens_insert_own on public.device_tokens
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy device_tokens_update_own on public.device_tokens
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy device_tokens_delete_own on public.device_tokens
  for delete to authenticated
  using (user_id = (select auth.uid()));
