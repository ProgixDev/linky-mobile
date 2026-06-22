-- activity-inbox — per-user in-app notifications. RLS-first.
-- RLS is auto-enabled by the skeleton's 0001 event trigger.
-- A notification is READ only by its recipient; it is INSERTED by the actor who
-- caused it, who must stamp themselves as actor_id (so "X liked your post" can
-- only be created by X). For system notifications, insert with the service_role.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  -- The recipient (who sees it in their inbox).
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Who caused it (null for system notifications).
  actor_id uuid references auth.users (id) on delete set null,
  type text not null check (char_length(type) between 1 and 60),
  body text not null check (char_length(body) between 1 and 500),
  -- Optional deep-link target, e.g. "/post/123".
  entity text check (char_length(entity) <= 200),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.notifications to authenticated;
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- Recipient reads their own; can mark their own read.
create policy "notifications: read own" on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "notifications: mark own read" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- The actor creates the notification and must stamp themselves (or null actor is
-- disallowed for client inserts — system rows use service_role which bypasses RLS).
create policy "notifications: actor inserts" on public.notifications
  for insert to authenticated
  with check (actor_id = (select auth.uid()));

-- Stream new notifications to the recipient (RLS still filters per client).
alter publication supabase_realtime add table public.notifications;
