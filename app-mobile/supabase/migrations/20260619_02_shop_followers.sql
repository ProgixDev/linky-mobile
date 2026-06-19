-- Pre-prod: shop followers backend. Mirrors product_favorites + toggle_product_favorite
-- so the UX path (tap "Suivre" → live count flips) is identical to favoriting a product.
-- follower_count on shops is the denormalized cache the toggle keeps in sync inside the
-- same RPC. shops_with_counts already exposes the column, no view change needed.

create table if not exists public.shop_followers (
  user_id    uuid not null references public.users(id) on delete cascade,
  shop_id    uuid not null references public.shops(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, shop_id)
);
create index if not exists shop_followers_shop_idx on public.shop_followers(shop_id);
alter table public.shop_followers enable row level security;
-- No public policies: write endpoint runs as service_role after requireUser().

-- Toggle follow / unfollow atomically. Mirrors toggle_product_favorite : composite
-- key insert/delete + a clamped denormalized count update. The shop row is
-- FOR UPDATE locked so two concurrent toggles on the same shop serialize cleanly.
create or replace function public.toggle_shop_follower(
  p_user_id uuid,
  p_shop_id uuid
)
returns table (following boolean, follower_count int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existed     boolean;
  v_count       int;
  v_following   boolean;
begin
  perform 1 from public.shops where id = p_shop_id for update;

  select exists (
    select 1 from public.shop_followers
    where user_id = p_user_id and shop_id = p_shop_id
  ) into v_existed;

  if v_existed then
    delete from public.shop_followers
      where user_id = p_user_id and shop_id = p_shop_id;
    update public.shops as s set follower_count = greatest(s.follower_count - 1, 0)
      where s.id = p_shop_id
      returning s.follower_count into v_count;
    v_following := false;
  else
    insert into public.shop_followers (user_id, shop_id)
      values (p_user_id, p_shop_id);
    update public.shops as s set follower_count = s.follower_count + 1
      where s.id = p_shop_id
      returning s.follower_count into v_count;
    v_following := true;
  end if;

  following := v_following;
  follower_count := coalesce(v_count, 0);
  return next;
end;
$$;

revoke all on function public.toggle_shop_follower(uuid, uuid) from public, anon, authenticated;
grant execute on function public.toggle_shop_follower(uuid, uuid) to service_role;
