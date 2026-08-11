-- « Profil public » (client 2026-08-06) — the toggle on the Confidentialité
-- screen was pure client-side MMKV, so it could never affect what OTHER
-- users see. A shop must stay publicly visible for the marketplace to
-- function (that part of the old copy was never realistic), but the
-- author's DISPLAY NAME + AVATAR shown to strangers in comments/reviews is a
-- real, coherent thing to anonymize.
alter table public.users add column if not exists profile_public boolean not null default true;
