# Critical User Journeys

The flows that must never break. Every entry has: an owner, a Maestro flow
(deterministic gate), and agentic QA coverage (exploratory). Changing a CUJ's
behavior requires updating this file + its flow in the same PR (QA persona
enforces).

## CUJ-001 — Capture a task

- **Owner:** platform squad
- **Flow:** `.maestro/flows/tasks-cuj.yaml` · Smoke: `.maestro/flows/smoke.yaml`
- **Journey:** open app → type title → Add → task appears at top, count
  updates → toggle done → count updates → relaunch app → task persisted.
- **Edge cases agents must try:** empty title (inline error, no crash),
  201-char title (rejected), emoji/unicode titles, rapid double-tap Add,
  delete during entering animation, kill app mid-write then relaunch.
- **Performance budget:** add-task interaction < 100ms to visible row on a
  mid-range Android emulator.

## CUJ-002 — Driver views assigned deliveries

- **Owner:** founder (driver app)
- **Flow:** `.maestro/flows/deliveries-cuj.yaml` · Smoke: `.maestro/flows/smoke.yaml`
- **Journey:** launch → (cold start) sign in as a livreur → land on the deliveries
  home → see active deliveries (assigned/in_transit) newest-first, or a friendly
  empty state → pull to refresh → list updates.
- **Edge cases agents must try:** zero assigned (empty state, no error); request
  failure (error state + retry that re-fetches); offline with a prior load (cached
  list shown + “may be out of date” banner); offline with no cache (offline/retry
  state); a delivered/cancelled job never appears; after sign-out, the next driver
  never sees the previous driver’s cached list; full street address never shown on
  the list (area only).
- **Performance budget:** with a warm cache, the list is visible < 1s after auth on
  a mid-range Android (cache renders immediately; refresh happens in the background).

## CUJ-003 — Driver completes a handoff

- **Owner:** founder (driver app)
- **Flow:** `.maestro/flows/handoff-cuj.yaml` · Smoke: `.maestro/flows/smoke.yaml`
- **Journey:** open an assigned delivery → see full detail (order ref, item, **full
  street address**, buyer name, status) → tap “Scan to confirm delivery” → grant
  camera → scan the buyer’s on-screen order QR → review the matched order → tap the
  explicit “Confirm delivery” → success (“delivered — payment released”), and the
  delivery leaves the active list.
- **Edge cases agents must try:** a scan alone never releases (Confirm is a separate
  explicit tap); a QR for another order/driver or a forged token (rejected, nothing
  released); an already-delivered/released order (told it’s already done, no second
  release); camera permission denied (explainer + enable/Settings + cancel — never a
  dead end); offline at confirm (reconnect state + retry, nothing released while
  offline).
- **Performance budget:** detail visible < 1s after the row tap on a mid-range
  Android; the confirm round-trip resolves to success or an honest error within ~3s.
- **Note:** the live camera scan + escrow release are verified via Argent
  (`/verify-ui`), not Maestro — a simulator can’t scan a real QR and the post-scan
  review state isn’t deterministic; the Maestro flow covers navigation + the
  permission-denied path.

## Template for new CUJs

```
## CUJ-NNN — <name>
- Owner / Flow / Journey / Edge cases / Performance budget
```

Keep this list short (≤ 10) — if everything is critical, nothing is.
