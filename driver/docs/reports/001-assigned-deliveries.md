# Feature report — 001 Assigned-deliveries list for the driver

- **Spec:** [`specs/001-assigned-deliveries/spec.md`](../../specs/001-assigned-deliveries/spec.md) · **Plan:** [`plan.md`](../../specs/001-assigned-deliveries/plan.md)
- **Branch:** `feat/001-assigned-deliveries` · **Date:** 2026-06-22
- **Status:** code-complete; pre-merge UI verification deferred (no macOS simulator on the build host)

## What shipped

The driver's home is now their **active assigned deliveries**, fetched from a new
Supabase edge function, cached, and rendered with honest loading/empty/error/offline
states, pull-to-refresh, and foreground refresh. Driver identity is derived
server-side from the JWT (never sent by the client). The kept `tasks` demo moved to
`/tasks`.

24 files, +1115/-16. Commits:

- `f20552a` scaffold slice — schema, api client, store (T0–T4)
- `cd25669` list UI, row, route wiring (T5–T8)
- `778c0b3` maestro flows + verify green (T9, T11)
- `8cae780` review fixes — P1s + P2s (T12)

### Areas touched

- **Feature slice** `src/features/deliveries/` — `model/schema.ts`, `model/store.ts`,
  `lib/deliveries-api.ts`, `ui/deliveries-screen.tsx`, `ui/delivery-row.tsx`, `index.ts`, tests.
- **Backend** `supabase/functions/list-livreur-deliveries/index.ts` (Deno) + `config.toml` (`verify_jwt`).
- **Routing** `src/app/index.tsx` (home → deliveries), `src/app/tasks.tsx` (relocated demo),
  `src/app/delivery/[id].tsx` (placeholder), `src/app/_layout.tsx` (clear cache on sign-out).
- **QA** `.maestro/flows/deliveries-cuj.yaml` (new CUJ-002) + `tasks-cuj.yaml`/`smoke.yaml`
  (fixed stale appId, auth-aware) + `docs/quality/critical-user-journeys.md` (CUJ-002).

## Acceptance criteria → evidence

| AC | What it requires | Proven by | Status |
| --- | --- | --- | --- |
| AC-1 | Row shows ref/item/shop/area/status/time | `deliveries-screen.test.tsx` "loading→list"; `delivery-row.tsx` | ✅ unit/component |
| AC-2 | Only own active (assigned/in_transit) | `store.test.ts` `selectActiveDeliveries` + edge fn `.eq(livreur_id).in(status)` | ✅ unit + server |
| AC-3 | Newest first | `store.test.ts` "orders newest first" | ✅ unit |
| AC-4 | Refresh updates the list | `store.test.ts` "refresh re-fetches…reflects server changes" | ✅ unit |
| AC-5 | Empty state | `deliveries-screen.test.tsx` "empty" | ✅ component |
| AC-6 | Error + retry re-fetches | `deliveries-screen.test.tsx` "error state with retry" | ✅ component |
| AC-7 | Offline → cached list + stale banner | `deliveries-screen.test.tsx` "stale banner" + "defers load until rehydrated" | ✅ component |
| AC-8 | Loading state on first load | `deliveries-screen.test.tsx` "loading→list"; rehydration-gate test | ✅ component |
| AC-9 | Server-scoped identity; cache cleared on sign-out | `deliveries-api.test.ts` (no client identity) + `store.test.ts` clearCache + `_layout.tsx` wiring + edge fn `getUser()` | ✅ client unit + server; **app-level wiring pending UI verify** |
| AC-10 | Dropoff area only, no street | `schema.ts` (no `details` field) + `deliveries-api.test.ts` (strips `details`) + row renders city·district | ✅ unit/component |

## Verification

- `npm run verify` — **green**: format · lint · typecheck · **43 tests (11 suites)** · docs:lint (108 md) · secrets:check.
- `/review` (multi-persona) — 3 P1s found and fixed (rehydration race, `verify_jwt`, CUJ-002); cheap P2s fixed.
- `/security-review` — **PASS, no P1s**. Identity server-derived (AC-9) + `verify_jwt`; Zod at network + rehydration edges (SEC-INPUT-001); RLS-enforced (SEC-RLS-001); deep-link param display-only (SEC-LINK-002); `appStorage` accepted for area-only cache (SEC-STORE-001 — watch-item if precision increases).

## Deferred (must run before merge — needs macOS + Supabase access)

- **`/verify-ui` (T10):** Argent screenshots of loading/list/empty/error/offline on a simulator — not runnable on this Windows host.
- **`npm run e2e:ios` (T9):** Maestro flows written; need a booted simulator + a seeded livreur.
- **Edge function:** `deno check` + deploy `list-livreur-deliveries` to the shared Supabase project, then a live `functions.invoke` smoke test.

## Follow-ups (encode-lesson candidates, from review)

- Lint rule: flag `Animated.*` `entering/exiting` in `src/features/**` without `useReducedMotion()` (pre-existing in `tasks/ui/task-row.tsx` too).
- docs-lint: assert every `.maestro/flows/*.yaml` `CUJ-NNN` reference has a matching heading in `critical-user-journeys.md`.
- docs-lint/script: assert every `supabase/functions/<name>/` has a `[functions.<name>]` block with explicit `verify_jwt`.
