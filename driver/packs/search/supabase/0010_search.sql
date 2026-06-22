-- search — Postgres full-text search over a denormalized index table.
-- RLS is auto-enabled by the skeleton's 0001 event trigger.
--
-- The pattern: one search_documents row per searchable thing (a post, a profile,
-- a product). A generated tsvector column + GIN index makes search fast; the
-- search_documents() RPC ranks results with websearch_to_tsquery (so users can
-- type natural queries like "red shoes -leather"). Results are public read here;
-- scope the read policy down if your content isn't public.

create table public.search_documents (
  id uuid primary key default gen_random_uuid(),
  -- What this row points at, so the client can route on tap.
  kind text not null check (char_length(kind) between 1 and 40),
  ref_id uuid not null,
  owner_id uuid references auth.users (id) on delete cascade,
  title text not null,
  body text,
  -- Generated weighted document vector: title (A) ranks above body (B).
  tsv tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(body, '')), 'B')
  ) stored,
  updated_at timestamptz not null default now(),
  unique (kind, ref_id)
);
grant select, insert, update, delete on public.search_documents to authenticated;
create index search_documents_tsv_idx on public.search_documents using gin (tsv);

-- Public read (search hits are visible to all signed-in users). Tighten if needed.
create policy "search: public read" on public.search_documents
  for select to authenticated
  using (true);

-- Index rows are owned: you maintain only your own (or do it server-side).
create policy "search: write own" on public.search_documents
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Ranked search RPC. SECURITY INVOKER (default) so the read policy still applies.
create or replace function public.search_documents(q text, max_results integer default 20)
  returns table (id uuid, kind text, ref_id uuid, title text, body text, rank real)
  language sql
  stable
as $$
  select d.id, d.kind, d.ref_id, d.title, d.body,
         ts_rank(d.tsv, websearch_to_tsquery('simple', q)) as rank
  from public.search_documents d
  where d.tsv @@ websearch_to_tsquery('simple', q)
  order by rank desc
  limit greatest(1, least(max_results, 50));
$$;

-- Keep the index in sync with your real tables via triggers, e.g.:
--
--   create function public.index_post() returns trigger language plpgsql as $$
--   begin
--     insert into public.search_documents (kind, ref_id, owner_id, title, body)
--     values ('post', new.id, new.user_id, left(new.caption, 120), new.caption)
--     on conflict (kind, ref_id) do update
--       set title = excluded.title, body = excluded.body, updated_at = now();
--     return new;
--   end $$;
--   create trigger index_post_aiu after insert or update on public.posts
--     for each row execute function public.index_post();
