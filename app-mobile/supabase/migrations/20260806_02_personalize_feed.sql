-- « Recommandations personnalisées » (client 2026-08-06). Same reasoning as
-- profile_public : the toggle has a SERVER-side effect (discover-feed's
-- ranking), so it must live on the account's own row, not client-local MMKV.
alter table public.users add column if not exists personalize_feed boolean not null default true;
