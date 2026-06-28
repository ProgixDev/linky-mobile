-- 2026-06-27: separate driver accounts from marketplace accounts.
-- A Linky email used in the marketplace (client / vendeur / agent) cannot also be a
-- livreur — the driver app refuses such a login at otp-request. Track each account's
-- ORIGIN app so the check is exact: a newly-created driver-app account is tagged
-- 'driver' (otp-verify); everyone else stays 'marketplace'.
alter table public.users add column if not exists origin_app text not null default 'marketplace';

-- Backfill: existing DEDICATED-livreur accounts (livreur role, no marketplace role)
-- keep driver access; every other existing account (incl. seller/buyer who are ALSO
-- livreur) is treated as marketplace and can no longer log into the driver app.
update public.users
   set origin_app = 'driver'
 where 'livreur' = any(roles)
   and not (roles && array['buyer', 'seller', 'agent']);
