-- 0002_profiles — a public mirror of auth.users.
--
-- Never expose auth.users via the API (it holds emails, hashes, provider data —
-- Supabase advisor lint 0002). Instead mirror only the fields the app needs into
-- public.profiles, owned by the user and RLS-scoped.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  created_at timestamptz not null default now()
);
-- RLS is auto-enabled by the 0001 event trigger; grant + scope explicitly.
grant select, insert, update on public.profiles to authenticated;

create policy "profiles: select own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy "profiles: insert own" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles: update own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Auto-create a profile row on signup (runs as definer; pinned search_path).
create or replace function private.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
