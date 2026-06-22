-- comments — reusable comments on any entity (post, reel, product…). RLS-first.
-- RLS is auto-enabled by the skeleton's 0001 event trigger.
-- (entity_type, entity_id) is the polymorphic target. One level of replies via
-- parent_id. Public read; you write/delete only your own.

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (char_length(entity_type) between 1 and 40),
  entity_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  parent_id uuid references public.comments (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.comments to authenticated;
create index comments_entity_idx on public.comments (entity_type, entity_id, created_at);
create index comments_parent_idx on public.comments (parent_id);

-- Public read (comments are visible to all signed-in users).
create policy "comments: public read" on public.comments
  for select to authenticated
  using (true);

-- Write only as yourself.
create policy "comments: insert own" on public.comments
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Delete only your own.
create policy "comments: delete own" on public.comments
  for delete to authenticated
  using (user_id = (select auth.uid()));
