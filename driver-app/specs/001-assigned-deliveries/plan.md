# Plan 001 — Assigned-deliveries list for the driver

- **Spec:** [spec.md](spec.md) (all open questions resolved: yes)
- **Author:** Claude (agent) · **Date:** 2026-06-22
- **Size:** **M** — one new feature slice (`deliveries`) + one small Deno edge function + thin route rewire, ≤ ~2 days. It instantiates the already-documented network-fetch pattern (architecture-overview "network (future) → api client in feature lib/ → zod-parsed DTOs → store"), so no new architecture; no new dependency; no ADR.

## Approach

Add a `deliveries` slice that fetches the signed-in driver's active deliveries from a new Supabase edge function, caches the result, and renders a stateful list. The driver identity is **never sent by the client** — `supabase.functions.invoke` attaches the session JWT and the function derives `livreur_id` from it (this is what makes AC-9 real). The store persists the last good list via `appStorage` (Zod-validated on rehydrate, like `tasks`); on a refresh failure it keeps showing the cached rows with a "may be out of date" banner, and shows a retry state only when there is nothing cached. Key trade-off: **v1 does not distinguish true offline from a server error** (no connectivity library) — both map to honest "couldn't refresh / check connection" copy; real `online/offline` detection is a deliberate later enhancement. The list becomes the driver's home (`/`); the kept `tasks` demo moves to `/tasks`.

## Already exists — reuse, do NOT recreate

| Need                      | Reuse (path)                                                                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Driver session / identity | `features/auth` → `useAuthStore` (`session`, `status`), `useProtectedRoute` (root layout). **Not importable from `deliveries`** — wire cache-clear at the app layer. |
| Call the backend          | `shared/lib/supabase.ts` → `supabase.functions.invoke('…', { method })` (auto-attaches auth header). Pattern: `features/auth/model/store.ts:85`.                     |
| Cache list                | `shared/lib/storage` → `appStorage` / `asyncStorageBackend` + zustand `persist` + Zod `merge` (pattern: `features/tasks/model/store.ts`).                            |
| UI states                 | `shared/ui` → `Screen`, `EmptyState`, `Skeleton`, `Button`, `AppText`, `Card`. `FlatList` + RN `RefreshControl` (no wrapper exists).                                 |
| Slice shape, tests        | `features/tasks/*` (schema/store/screen/row/tests), `shared/testing/render`.                                                                                         |
| Edge-function auth        | `supabase/functions/delete-account/index.ts` (Bearer → `userClient.auth.getUser()`; service-role client for privileged query).                                       |

## Placement (per `docs/architecture/module-boundaries.md`)

| What               | Where                                                 | Notes                                                                                                                                     |
| ------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Home route         | `src/app/index.tsx`                                   | renders `DeliveriesScreen` (driver front door)                                                                                            |
| Demo relocation    | `src/app/tasks.tsx` (new), update maestro deep-links  | move kept `tasks` demo off `/`                                                                                                            |
| Detail stub        | `src/app/delivery/[id].tsx`                           | minimal "coming soon" placeholder so a tapped row resolves (the detail/handoff spec replaces it)                                          |
| Cache-clear wiring | `src/app/_layout.tsx`                                 | on auth → `unauthenticated`, call `deliveries.clearCache()` (app composes the two features)                                               |
| Slice              | `src/features/deliveries/`                            | `model/schema.ts`, `model/store.ts`, `lib/deliveries-api.ts`, `ui/deliveries-screen.tsx`, `ui/delivery-row.tsx`, `index.ts`, `__tests__/` |
| Backend            | `supabase/functions/list-livreur-deliveries/index.ts` | Deno; **not covered by `npm run verify`** (functions excluded) — verify via `deno`/manual                                                 |
| Shared additions   | none                                                  | stale/offline banner is feature-local until a 2nd consumer                                                                                |

## Data & state

- **Async data:** `lib/deliveries-api.ts` → `supabase.functions.invoke('list-livreur-deliveries')` → Zod-parse `DeliveryListSchema`. No client-supplied identity in the request.
- **DTO (`model/schema.ts`):** `Delivery = { id, orderRef, itemTitle, itemPhoto (url|''), shopName, dropoffCity, dropoffDistrict, status: 'assigned'|'in_transit', createdAt: epoch }`. **No street `details` field** (AC-10 — privacy by construction).
- **Client state (`model/store.ts`):** `{ items: Delivery[]; status: 'idle'|'loading'|'refreshing'|'success'|'error'; error: string|null; lastFetchedAt: number|null }`; actions `load()`, `refresh()`, `clearCache()`. Persist `items`+`lastFetchedAt` via `appStorage`, Zod-validate on `merge`. Selector `selectActiveDeliveries` = filter status ∈ {assigned,in_transit} **and** sort `createdAt` desc (defensive: AC-2 + AC-3 hold client-side even if the server drifts).
- **Validation:** edge input parsed by `DeliveryListSchema`; rehydration validated in `merge`.

## Acceptance criteria → verification mapping

| AC                   | Proven by                                                                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1 row content     | `__tests__/deliveries-screen.test.tsx` (row shows ref/item/shop/area/status/time via testIDs) + maestro `deliveries-cuj.yaml`                                                                |
| AC-2 active+own only | unit `__tests__/store.test.ts` (`selectActiveDeliveries` drops delivered/failed/etc.) + **server** query in `list-livreur-deliveries` (livreur_id from JWT, status filter)                   |
| AC-3 newest first    | unit `__tests__/store.test.ts` (selector sort `createdAt` desc)                                                                                                                              |
| AC-4 refresh         | unit `__tests__/store.test.ts` (`refresh()` re-invokes, updates) + component (RefreshControl `onRefresh` → action; AppState foreground → `refresh`)                                          |
| AC-5 empty           | component `deliveries-screen.test.tsx` (empty → `deliveries-empty`) + maestro                                                                                                                |
| AC-6 error           | component (reject + no cache → `deliveries-error` + `deliveries-retry`; retry re-invokes)                                                                                                    |
| AC-7 offline/stale   | component (seed cache + reject → rows render + `deliveries-stale-banner`; no cache + reject → error/retry)                                                                                   |
| AC-8 loading         | component (pending → `deliveries-loading` Skeleton)                                                                                                                                          |
| AC-9 server-scoped   | unit `__tests__/deliveries-api.test.ts` (request carries **no** livreur/identity arg) + store test (`clearCache` on sign-out) + **server** `getUser()`-derived identity (manual/deno verify) |
| AC-10 area-only      | schema (no `details` field) + component (renders city/district, not street)                                                                                                                  |

## Risks & unknowns

1. **Backend endpoint does not exist yet (top risk).** Build `list-livreur-deliveries` here (T0) and deploy to the shared Supabase project; name is driver-specific so it won't clash with Linky's functions. It is **outside `npm run verify`** — RN work proceeds against a mocked api in parallel; the function is verified via `deno`/manual invoke. **Decided (founder, 2026-06-22): build in THIS repo.**
2. **AC-2/AC-9 server enforcement isn't gate-covered here.** Mitigated by client defensive filter + the "no client identity" api test; server behavior documented + manually verified.
3. **Cross-user cache leak** (AC-9 "including from cache"): `clearCache()` wired on sign-out at the app layer.
4. **Home-route change** touches CUJ-001: update `tasks-cuj.yaml` + `smoke.yaml` to deep-link `linkydriver://tasks`; risk of a broken flow → re-run e2e after.
5. **Offline ≠ error precision** deferred (no connectivity lib) — accepted for v1.
6. **Cache sensitivity:** order refs + dropoff area cached in plaintext `appStorage`. Area-only minimizes exposure; **flag for `/security-review`** to confirm `appStorage` vs `secureStorage`.

## Overlap check

Active specs touching the same areas: **none** (001 is the only spec; `auth` is a stable slice, used only via the app layer, not imported). Route rewire touches the kept `tasks` demo (not an active spec) — handled in-plan via deep-link updates.
