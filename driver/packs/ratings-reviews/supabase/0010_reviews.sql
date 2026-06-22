-- ratings-reviews — star ratings + text reviews on any entity. RLS-first.
-- RLS is auto-enabled by the skeleton's 0001 event trigger.
-- One review per (user, entity): a unique constraint + upsert means re-reviewing
-- updates instead of duplicating. Public read; write/delete only your own.

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (char_length(entity_type) between 1 and 40),
  entity_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text check (char_length(body) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_type, entity_id, user_id)
);
grant select, insert, update, delete on public.reviews to authenticated;
create index reviews_entity_idx on public.reviews (entity_type, entity_id);

create policy "reviews: public read" on public.reviews
  for select to authenticated using (true);

create policy "reviews: write own" on public.reviews
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Aggregate summary for an entity: average + count. SECURITY INVOKER so RLS holds.
create or replace function public.review_summary(p_entity_type text, p_entity_id uuid)
  returns table (avg_rating numeric, review_count bigint)
  language sql
  stable
as $$
  select coalesce(round(avg(rating)::numeric, 2), 0) as avg_rating,
         count(*) as review_count
  from public.reviews
  where entity_type = p_entity_type and entity_id = p_entity_id;
$$;
