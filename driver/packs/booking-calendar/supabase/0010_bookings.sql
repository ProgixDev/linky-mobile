-- booking-calendar — resources, availability windows, and bookings. RLS-first.
-- RLS is auto-enabled by the skeleton's 0001 event trigger.
-- Double-booking is prevented by the DATABASE (a unique constraint), not by
-- client checks — the only safe place to enforce it under concurrency.

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  slot_minutes integer not null default 30 check (slot_minutes between 5 and 480),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.resources to authenticated;

-- Bookable windows for a resource (e.g. Mon 9:00-17:00 as one row per day/window).
create table public.availability (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  check (ends_at > starts_at)
);
grant select, insert, update, delete on public.availability to authenticated;
create index availability_resource_idx on public.availability (resource_id, starts_at);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  slot_start timestamptz not null,
  slot_end timestamptz not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  check (slot_end > slot_start),
  -- The anti-double-book guarantee: one active booking per resource+slot.
  unique (resource_id, slot_start)
);
grant select, insert, update on public.bookings to authenticated;
create index bookings_resource_idx on public.bookings (resource_id, slot_start);

-- resources + availability are public read (so customers can browse and book).
create policy "resources: public read" on public.resources for select to authenticated using (true);
create policy "resources: owner writes" on public.resources for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "availability: public read" on public.availability for select to authenticated using (true);
create policy "availability: owner writes" on public.availability for all to authenticated
  using (
    exists (select 1 from public.resources r
            where r.id = resource_id and r.owner_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.resources r
            where r.id = resource_id and r.owner_id = (select auth.uid()))
  );

-- bookings: you read/manage your own; the resource owner reads bookings for their resource.
create policy "bookings: read own or as owner" on public.bookings for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.resources r
               where r.id = resource_id and r.owner_id = (select auth.uid()))
  );
create policy "bookings: create own" on public.bookings for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "bookings: cancel own" on public.bookings for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
