-- profile-settings — adds avatar + bio to the profiles table (created in the
-- skeleton's Phase 2 migration). RLS (select/insert/update own) already covers
-- these columns, so nothing else to grant.
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio text check (char_length(bio) <= 280);
