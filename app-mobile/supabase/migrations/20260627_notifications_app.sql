-- 2026-06-27: scope notifications per app.
-- A Linky user can be a buyer/seller AND a livreur on ONE account, so the shared
-- public.notifications table leaked marketplace notifications into the driver app's
-- inbox. Tag each row with the app it belongs to; list-notifications then filters:
-- the driver app (app:'driver') sees ONLY delivery notifications, the marketplace app
-- excludes them. notify() (_shared/push.ts) writes the app from NotifyInput.app.
alter table public.notifications add column if not exists app text not null default 'marketplace';

-- Move existing delivery-assignment notifications (deeplink /delivery/<id>) to the
-- driver inbox; every other existing row stays 'marketplace'.
update public.notifications
   set app = 'driver'
 where deeplink like '/delivery/%' and app <> 'driver';
