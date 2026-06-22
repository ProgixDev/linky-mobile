-- social-graph — directed follow edges. RLS-first.
-- RLS is auto-enabled by the skeleton's 0001 event trigger.
-- Follows are public (counts/lists are visible), but you can only create or
-- remove YOUR OWN follow edge.

create table public.follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  following_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  -- No self-follows.
  constraint no_self_follow check (follower_id <> following_id)
);
grant select, insert, delete on public.follows to authenticated;
create index follows_following_idx on public.follows (following_id);

-- Anyone signed in can read the graph (for counts and follower/following lists).
create policy "follows: public read" on public.follows
  for select to authenticated
  using (true);

-- You may only create an edge where YOU are the follower.
create policy "follows: follow as self" on public.follows
  for insert to authenticated
  with check (follower_id = (select auth.uid()));

-- You may only remove your own follow.
create policy "follows: unfollow own" on public.follows
  for delete to authenticated
  using (follower_id = (select auth.uid()));
