# Product Vision

## What we’re building

Linky Driver is the driver-side companion app for [Linky](../../../linky),
Guinea’s products & real-estate marketplace. When a buyer pays for a product,
the order enters escrow; a driver (_livreur_) accepts the delivery, collects the
item from the seller, brings it to the buyer, and at handoff **scans the buyer’s
on-screen order QR** to confirm delivery — which releases the escrowed payment to
the seller. Linky Driver makes that loop fast, trustworthy, and low-friction on a
mid-range Android phone over a patchy network.

It shares one backend with the consumer app — the same Supabase project
(`orders`, `deliveries`, `wallets`, RLS-first; see ADR-0007) — so a delivery the
driver completes here is the same record the buyer and seller see in Linky.

## Who it’s for

**Primary persona — the livreur.** An independent delivery driver in a Guinean
city (Conakry first), often on a motorbike, working from an Android phone with
intermittent data and limited battery. Their top jobs-to-be-done:

- See available / assigned deliveries with pickup and drop-off addresses and pay.
- Accept a job and move through its states: assigned → picked up → in transit →
  delivered.
- At the door, scan the buyer’s QR to confirm handoff and trigger escrow release.
- Track completed deliveries and earnings.

**Success for them:** they can reliably get paid for completed runs, never lose a
delivery to a dropped connection, and never get blocked at handoff. Success for
the platform: every escrow release is backed by a real, verified handoff.

## What “quality” means here

The three product qualities we never trade away:

1. **Handoff integrity.** A delivery is only marked delivered — and escrow only
   released — by a successful QR scan of the buyer’s order. No spoofing, no
   manual “trust me” override from the client.
2. **Works on a bad network.** Core actions (view assigned deliveries, capture a
   scan, advance status) tolerate flaky connectivity and reconcile when back
   online. No data loss; no double-release.
3. **Low-friction, glanceable UI.** Big targets, minimal taps from “new job” to
   “delivered,” readable one-handed in daylight on a phone screen.

## Anti-goals

- **No turn-by-turn navigation.** We show the address and hand off to the
  driver’s preferred maps app; we do not build or maintain in-app routing.
- Not the consumer or seller experience — those live in the Linky app.
- Not an admin/dispatch console — that is the Linky admin surface.

## Current focus

Stand up the driver loop end to end on top of the existing Linky backend:
authenticated livreur sign-in, the assigned-deliveries list, status transitions,
and the QR-scan handoff that releases escrow. Quarter-level priorities and their
acceptance criteria live as PRDs in [prds/](prds/README.md).
