-- Pre-prod: property favorites mirror product_favorites (20260529_03+04) so
-- the Decouvrir reel can persist a like on a property the same way it does on
-- a product. properties.fav_count already exists (20260530_01 line 34) ; the
-- toggle RPC keeps that denormalized count in sync inside the same tx.

create table if not exists public.property_favorites (
  user_id     uuid not null references public.users(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, property_id)
);
create index if not exists property_favorites_property_idx on public.property_favorites(property_id);
alter table public.property_favorites enable row level security;
-- No public policies: write endpoint runs as service_role after requireUser().

-- Toggle favorite/unfavorite atomically. Mirrors toggle_product_favorite :
-- composite-key insert/delete + a clamped fav_count update. The property row
-- is FOR UPDATE locked so two concurrent toggles on the same property
-- serialize cleanly. Column references aliased as `p` to avoid the OUT
-- parameter / column ambiguity that bit toggle_product_favorite (see
-- migration 20260530_03_favorites_rpc_fix.sql).
create or replace function public.toggle_property_favorite(
  p_user_id     uuid,
  p_property_id uuid
)
returns table (favorited boolean, fav_count int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existed   boolean;
  v_count     int;
  v_favorited boolean;
begin
  perform 1 from public.properties where id = p_property_id for update;

  select exists (
    select 1 from public.property_favorites
    where user_id = p_user_id and property_id = p_property_id
  ) into v_existed;

  if v_existed then
    delete from public.property_favorites
      where user_id = p_user_id and property_id = p_property_id;
    update public.properties as p set fav_count = greatest(p.fav_count - 1, 0)
      where p.id = p_property_id
      returning p.fav_count into v_count;
    v_favorited := false;
  else
    insert into public.property_favorites (user_id, property_id)
      values (p_user_id, p_property_id);
    update public.properties as p set fav_count = p.fav_count + 1
      where p.id = p_property_id
      returning p.fav_count into v_count;
    v_favorited := true;
  end if;

  favorited := v_favorited;
  fav_count := coalesce(v_count, 0);
  return next;
end;
$$;

revoke all on function public.toggle_property_favorite(uuid, uuid) from public, anon, authenticated;
grant execute on function public.toggle_property_favorite(uuid, uuid) to service_role;
