# Pack: booking-calendar

Appointment booking — the backbone of every services app (barbers, clinics, classes, rentals).
Resources + availability windows + bookings, with **double-booking prevented by the database**, not
client checks. Logic-first; UI is a placeholder. **Key-free.**

## What you get

- `supabase/0010_bookings.sql` — `resources`, `availability`, `bookings`. RLS: resources/availability
  public-read + owner-managed; bookings are own-managed and visible to the resource owner. A
  `unique (resource_id, slot_start)` constraint is the anti-double-book guarantee.
- `data/booking-repo.ts` — `listSlots` (availability minus booked), `book` (handles the lost-race
  cleanly), `cancelBooking`, `myBookings`.
- `useBooking(resourceId, day)` — slots for a day + a `reserve` action that reloads taken state.
- `BookingScreen` — **placeholder** slot grid.

## Install

```
/add-feature booking-calendar
# apply the migration, then:
supabase db reset && supabase test db
```

Seed a `resources` row + `availability` windows, then:

```tsx
<BookingScreen resourceId={barberId} />
```

## Security & correctness

Two users tapping the same slot at once can't both win: the **unique constraint** rejects the second
insert, and `book()` surfaces it as "that slot was just taken." This is why the rule is enforced in
the DB — a client-side "is it free?" check is racy. RLS keeps a customer from reading others'
bookings while letting the resource owner see their own schedule. Charge on booking by pairing with
`payments-revenuecat`/Stripe, and confirm/remind via `activity-inbox` + `push-notifications`.
