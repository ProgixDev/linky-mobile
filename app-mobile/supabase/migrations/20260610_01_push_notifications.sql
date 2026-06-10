-- Phase O.1 — push notifications : device tokens + in-app notification feed.
--
-- push_tokens : one row per device (Expo push token). A token is device-scoped,
-- not user-scoped — when another account signs in on the same device the row is
-- reassigned to the new user (upsert on token in register-push-token).
--
-- notifications : the in-app feed behind app/notifications.tsx. Every push
-- dispatch also inserts one row per recipient, so the feed doubles as the
-- audit trail of what was sent (push delivery itself is best-effort).
--
-- Both tables : RLS enabled with no policies — service-role access only,
-- auth enforced at the edge-function layer via requireUser (same posture as
-- conversations/messages, see 20260603_01).

create table public.push_tokens (
  id uuid primary key default public.uuidv7(),
  user_id uuid not null references public.users(id),
  token text not null,
  platform text not null check (platform in ('ios', 'android')),
  device_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_tokens_token_unique unique (token)
);

create index push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

create table public.notifications (
  id uuid primary key default public.uuidv7(),
  user_id uuid not null references public.users(id),
  category text not null check (category in ('order', 'message', 'visit', 'promo', 'system')),
  title text not null,
  body text not null,
  icon_hint text not null default 'info',
  deeplink text,
  ref_type text check (ref_type in ('order', 'conversation', 'visit_request')),
  ref_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
-- Unread dot / badge counts hit this hard ; partial keeps it tiny.
create index notifications_user_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;
