-- Comment likes + one-level threaded replies (client 2026-07-07).
-- Extends the 20260705_01 comments table:
--   - parent_id : self-FK for replies (ONE level — a reply can't be replied to,
--     replies always attach to a top-level comment; enforced in post-comment).
--   - like_count : denormalized, recomputed from comment_likes on every toggle
--     under a row lock, so it can never drift from the source of truth.
--   - comment_likes : one row per (comment, user).

alter table public.comments
  add column if not exists parent_id uuid references public.comments(id) on delete cascade;

alter table public.comments
  add column if not exists like_count int not null default 0;

-- Replies of a parent, oldest-first (chronological thread order).
create index if not exists comments_parent_idx
  on public.comments (parent_id, created_at asc)
  where parent_id is not null;

create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
alter table public.comment_likes enable row level security;
-- service_role only (edge functions bypass RLS); no public policies.

-- toggle_comment_like — atomic like/unlike. Row-locks the comment so
-- concurrent toggles serialize, then RECOMPUTES like_count from comment_likes
-- (drift-proof, unlike an increment/decrement). Returns the new state.
create or replace function public.toggle_comment_like(p_comment_id uuid, p_user_id uuid)
returns table (liked boolean, like_count int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exists boolean;
  v_now_liked boolean;
  v_count int;
begin
  perform 1 from public.comments where id = p_comment_id for update;
  if not found then raise exception 'comment_not_found' using errcode = 'P0002'; end if;

  select exists(
    select 1 from public.comment_likes
     where comment_id = p_comment_id and user_id = p_user_id
  ) into v_exists;

  if v_exists then
    delete from public.comment_likes
     where comment_id = p_comment_id and user_id = p_user_id;
    v_now_liked := false;
  else
    insert into public.comment_likes (comment_id, user_id)
      values (p_comment_id, p_user_id)
      on conflict do nothing;
    v_now_liked := true;
  end if;

  select count(*)::int into v_count
    from public.comment_likes where comment_id = p_comment_id;
  update public.comments set like_count = v_count where id = p_comment_id;

  return query select v_now_liked, v_count;
end;
$$;

revoke all on function public.toggle_comment_like(uuid, uuid) from public, anon, authenticated;
grant execute on function public.toggle_comment_like(uuid, uuid) to service_role;
