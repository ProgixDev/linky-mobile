# Tasks 001 — Assigned-deliveries list for the driver

Ordered, executable, checkboxed. Work top-to-bottom, tick boxes as you commit, never reorder silently. `[P]` = safe to parallelize. Each task names its files + done-check. Keep tasks ≤ ~30 min. Test tasks precede their implementation.

## Phase 0 — setup

- [x] **T0** Branch `feat/001-assigned-deliveries`; scaffold slice with `/new-module deliveries` — files: `src/features/deliveries/*` (schema/store/ui/index/**tests** skeleton). · done: typecheck green, `index.ts` exports compile.
- [x] **T1** Backend edge function `supabase/functions/list-livreur-deliveries/index.ts` (Deno): Bearer → `userClient.auth.getUser()` (401 if none); **service-role** query `deliveries` where `livreur_id = user.id` AND `status in ('assigned','in_transit')`, join `orders` (`reference`, `product_snapshot.title/photo`, `shop_id`) + `shops` (`name`), read `delivery_address` `city`/`district`; order `created_at desc`; return JSON array of the DTO (NO street `details`). · done: `deno check` passes; manual `functions.invoke` returns an array for a seeded livreur. · note: outside `npm run verify`. (Decided: built in THIS repo.)

## Phase 1 — core behavior (AC-1, AC-2, AC-3, AC-10)

- [x] **T2** Schema: `model/schema.ts` — `DeliveryStatus` enum (`assigned`/`in_transit`), `DeliverySchema` (id, orderRef, itemTitle, itemPhoto, shopName, dropoffCity, dropoffDistrict, status, createdAt), `DeliveryListSchema`. No `details` field. · done: typecheck green. (AC-1, AC-10)
- [x] **T3** API test-first: `__tests__/deliveries-api.test.ts` (mock `supabase.functions.invoke`; assert invoked with name + method and **no livreur/identity argument**; parses valid payload; throws on bad payload) → then `lib/deliveries-api.ts`. · done: test green. (AC-9 client, AC-1 parse)
- [x] **T4** Store test-first: `__tests__/store.test.ts` (load success sets items; `selectActiveDeliveries` drops non-active + sorts newest-first; `refresh()` re-invokes; failure sets error but **keeps** `items`; `clearCache()` empties items + persisted cache) → then `model/store.ts` (state + actions + `persist` via `appStorage`/`asyncStorageBackend` + Zod `merge`). · done: store tests green. (AC-2, AC-3, AC-4, AC-6 state, AC-7 cache-kept, AC-9 clear)
- [x] **T5 [P]** Row UI: `ui/delivery-row.tsx` — `Card` with order ref, `expo-image` thumbnail + item title, shop name, area `city · district`, status badge, relative time; `testID="deliveries-row-{id}"`; pressable → `router.push('/delivery/'+id)`. · done: renders. (AC-1, AC-10)
- [x] **T6** Screen UI: `ui/deliveries-screen.tsx` — `Screen` + `FlatList(selectActiveDeliveries)` with `RefreshControl(onRefresh=refresh)`; states: loading `Skeleton` (`deliveries-loading`), empty `EmptyState` (`deliveries-empty`), error+retry (`deliveries-error`/`deliveries-retry`), stale banner when cached & last refresh failed (`deliveries-stale-banner`); `AppState` foreground listener → `refresh()`. Feature-prefixed testIDs. · done: all states render. (AC-1, AC-5, AC-6, AC-7, AC-8)
- [x] **T7** Component tests: `__tests__/deliveries-screen.test.tsx` (mock api) — loading→list (AC-1, AC-8); empty (AC-5); reject+no cache→error, retry re-invokes (AC-6); seed cache+reject→rows + stale banner (AC-7); area shown, no street (AC-10). · done: green.
- [x] **T8** Route + wiring: `src/app/index.tsx`→`DeliveriesScreen`; add `src/app/tasks.tsx`→`TasksScreen`; add placeholder `src/app/delivery/[id].tsx` ("coming soon"); in `src/app/_layout.tsx` clear deliveries cache when auth status → `unauthenticated`. Export `DeliveriesScreen`, `useDeliveriesStore`, `Delivery` from `index.ts`. · done: app navigable; sign-out empties cache. (AC-9 cross-user)

## Phase 2 — verification

- [x] **T9** Maestro: `.maestro/flows/deliveries-cuj.yaml` (launch as signed-in driver → list or empty → swipe-down refresh); updated `.maestro/flows/tasks-cuj.yaml` + `smoke.yaml` (fixed stale appId → `com.linky.driver.dev`, auth-aware, tasks via `linkydriver://tasks`). · done: flows written; **`npm run e2e:ios` execution DEFERRED — needs macOS simulator + a seeded livreur (not available here).**
- [ ] **T10** `/verify-ui` — boot app (Argent), walk **CUJ-002**, screenshot loading/list/empty/error/offline, inspect against ACs; fix what you see. **DEFERRED — Argent needs a macOS iOS simulator; not runnable on this Windows host. Must be run before merge.**
- [x] **T11** `npm run verify` green (format + lint + typecheck + 42 tests + docs:lint + secrets); commit history clean (Conventional Commits).

## Phase 3 — review & ship

- [x] **T12** `/review` (multi-persona) → 3 P1s fixed: cold-start rehydration race (AC-7/8), missing `verify_jwt` for the new edge fn, unregistered CUJ-002. Cheap P2s also fixed (reduced-motion gate, pill contrast, edge-fn error log, AC-4 + rehydration tests).
- [x] **T13** `/security-review`: PASS, no P1s. AC-9 server-derived identity + `verify_jwt`; Zod at network + rehydration edges (SEC-INPUT-001); RLS-enforced (SEC-RLS-001); `appStorage` accepted for area-only cache (SEC-STORE-001 watch-item: move to secureStorage if dropoff precision increases); deep-link param display-only (SEC-LINK-002).
- [x] **T14** `/feature-report` → `docs/reports/001-assigned-deliveries.md` (AC→test traceability, verdicts; screenshots deferred with T10).
- [ ] **T15** Open PR — **BLOCKED: the only remote is the upstream skeleton (`ProgixDev/expo-skeleton`).** Create a dedicated `linky-driver` GitHub repo, set `origin`, push, then open the PR. Do NOT push this branch to the skeleton repo.
- [ ] **T16** After merge: `/update-docs` — feature doc, flip spec → `shipped`. (CUJ-002 already registered during T12.) Deferred until merged.

## AC coverage (mirror of plan.md — keep ticked in sync)

- [ ] AC-1 → T5, T6, T7, T9
- [ ] AC-2 → T4 (selector), T1 (server)
- [ ] AC-3 → T4
- [ ] AC-4 → T4, T6
- [ ] AC-5 → T7, T9
- [ ] AC-6 → T7
- [ ] AC-7 → T7
- [ ] AC-8 → T7
- [ ] AC-9 → T3, T4 (clearCache), T8, T1 (server)
- [ ] AC-10 → T2 (schema), T5, T7
