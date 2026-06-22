-- feed-reels — a public vertical video feed (TikTok-style). RLS-first.
-- Posts are PUBLIC content (any signed-in user reads all), so `using (true)` on
-- SELECT is intentional here — these rows are not private data. Writes are owner-scoped.

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  video_url text not null,
  caption text check (char_length(caption) <= 500),
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.posts to authenticated;
create index posts_created_idx on public.posts (created_at desc);

create policy "posts: read all" on public.posts for select to authenticated using (true);
create policy "posts: insert own" on public.posts for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "posts: delete own" on public.posts for delete to authenticated
  using ((select auth.uid()) = user_id);

create table public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
grant select, insert, delete on public.post_likes to authenticated;
create index post_likes_post_idx on public.post_likes (post_id);

create policy "likes: read all" on public.post_likes for select to authenticated using (true);
create policy "likes: like own" on public.post_likes for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "likes: unlike own" on public.post_likes for delete to authenticated
  using ((select auth.uid()) = user_id);
