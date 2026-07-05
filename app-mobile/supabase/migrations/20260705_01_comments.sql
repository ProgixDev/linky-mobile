-- Listing comments — public discussion thread under a product OR property listing.
-- Polymorphic (listing_kind + listing_id): a comment can hang off either
-- products or properties, so there is no FK to the listing (two possible
-- parents). A deleted listing just leaves orphan rows that are never queried.
-- author_id cascades so deleting a user cleans up their comments and never
-- blocks the user delete. Mirrors the reviews table conventions (uuidv7 PK,
-- service_role-only RLS, length check, created_at index).
create table if not exists public.comments (
  id           uuid primary key default public.uuidv7(),
  listing_kind text not null check (listing_kind in ('product','property')),
  listing_id   uuid not null,
  author_id    uuid not null references public.users(id) on delete cascade,
  body         text not null check (char_length(body) between 1 and 1000),
  created_at   timestamptz not null default now()
);

create index if not exists comments_listing_created_idx
  on public.comments (listing_kind, listing_id, created_at desc);

-- RLS on; backend uses service_role (bypasses it). No public policies.
alter table public.comments enable row level security;
