-- 0003_notes — the CANONICAL owner-scoped CRUD pattern.
--
-- Copy this shape for any per-user table. Key points:
--   * one policy PER command (never FOR ALL),
--   * always `to authenticated`,
--   * wrap auth.uid() in `(select …)` so Postgres caches it per-statement,
--   * INSERT/UPDATE need WITH CHECK so a user can't write rows they don't own,
--   * index the policy column (user_id).
-- This replaces the painted-door demo: real data, persisted, RLS-enforced.

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(body) <= 2000),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.notes to authenticated;

create index notes_user_id_idx on public.notes (user_id);

create policy "notes: select own" on public.notes
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "notes: insert own" on public.notes
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "notes: update own" on public.notes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "notes: delete own" on public.notes
  for delete to authenticated
  using ((select auth.uid()) = user_id);
