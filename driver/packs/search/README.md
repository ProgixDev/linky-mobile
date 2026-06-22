# Pack: search

**Real** search — not a client-side filter. Postgres full-text search (`tsvector` + GIN index) over a
denormalized `search_documents` index, ranked by relevance via a `websearch_to_tsquery` RPC so users
can type natural queries like `red shoes -leather`. Debounced UI. Logic-first; UI is a placeholder.
**Key-free.**

## What you get

- `supabase/0010_search.sql` — `search_documents` (generated weighted `tsv`, GIN index) + the
  ranked `search_documents(q)` RPC. Includes a commented trigger example to keep the index in sync.
- `data/search-repo.ts` — `searchContent(query)` (calls the RPC, never throws).
- `useSearch()` — debounced search with stale-response dropping.
- `SearchScreen` — **placeholder** search bar + ranked list.

## Install

```
/add-feature search
# apply the migration, then:
supabase db reset && supabase test db
```

**Populate the index** from your real tables with triggers (example in the SQL): on insert/update of
a post/profile/product, upsert a `search_documents` row. Then:

```tsx
<SearchScreen onOpen={(hit) => router.push(`/${hit.kind}/${hit.ref_id}`)} />
```

## Notes

Title is weighted above body (`A` vs `B`) so a title match ranks higher. Results are **public read**
by default — if your content isn't public, tighten the read policy (e.g. `owner_id = auth.uid()` or a
membership check) and the same RPC respects it (it runs SECURITY INVOKER). The `'simple'` dictionary
is language-agnostic; switch to `'english'`/`'french'` for stemming if your content is single-language.
