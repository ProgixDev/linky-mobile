# Feature packs

A library of **ready-made, self-contained feature modules** you can drop into an app to assemble a
full product in hours. Packs live here, **parked and inactive** — `packs/` is excluded from the app
(tsconfig, ESLint, Jest, the build), so it adds **zero weight** and never ships until you opt one in.

You activate a pack with the **`/add-feature <pack>`** skill, which copies it into `src/features/`,
wires the route/tab, runs any migration, and prints the config it needs.

## Principles

1. **Logic-first, UI-thin.** Each pack ships the **background**: data layer, state, services,
   realtime, migrations, hooks — fully wired. The UI is a **minimal, swappable placeholder**
   (token-driven, tagged `// DESIGN: replace after Claude Design`). Real screens come from the
   design pass, then drop onto the working logic.
2. **No API keys to develop.** Packs work in dev with **zero keys** (OpenFoodFacts for barcode,
   Supabase Realtime for chat, free OSRM for routing, RevenueCat Preview/StoreKit sandbox for
   payments). Real keys are needed only to ship — each pack's README lists them.
3. **Separated, not wired.** A pack does nothing until installed. You can read/keep many packs in
   the repo without any of them touching the app you're building.
4. **Secure by default.** Packs follow the skeleton's rules — RLS-first migrations, Zod at the
   edges, secrets server-side, storage via `@/shared/lib/storage`.

## How to use

```
/add-feature payments-revenuecat     # the skill copies the pack into src/features/, wires it, prints config
```

Or by hand: copy `packs/<name>/src/*` into `src/features/<name>/`, run the migration in
`packs/<name>/supabase/`, install the deps from `pack.json`, and follow `packs/<name>/README.md`.

## Catalog

Status: ✅ ready · 🟡 planned (harvest mapped) · ⬜ to build.

| Pack                    | Status | What it includes (background)                                                                                                     | Dev keys               | Harvest from                            |
| ----------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | --------------------------------------- |
| `payments-revenuecat`   | ✅     | RevenueCat client init, offerings/purchase/restore, `useEntitlement` (reads the server-owned `subscriptions` table), paywall stub | none (Preview/sandbox) | new + `libou`                           |
| `payments-stripe` (web) | 🟡     | Stripe checkout + webhook route, entitlement upsert, test-mode                                                                    | none (test mode)       | `getdraft`                              |
| `scan-barcode`          | ✅     | expo-camera scanner, OpenFoodFacts lookup, result model, history store, scan screen stub                                          | none (OpenFoodFacts)   | `libou/src/features/scan`               |
| `chat-realtime`         | ✅     | Supabase Realtime DMs/groups: migration + RLS (member-scoped), send/subscribe/read, hook; thread stub                             | none                   | `getdraft/app/chat` (adapt to Supabase) |
| `nav-turn-by-turn`      | ✅     | expo-location tracking, OSRM routing, turn-by-turn instruction engine, ETA; text stub                                             | none (OSRM)            | build                                   |
| `feed-reels`            | ✅     | Vertical video feed: migration + RLS, paginated query, autoplay-on-visible player, optimistic likes; feed stub                    | none                   | build                                   |
| `profile-settings`      | ✅     | Profile view/edit (profiles table) + local settings store + profile/edit/settings stubs                                           | none                   | `getdraft` profile/settings             |
| `auth-screens`          | ✅     | Passwordless OTP (email + SMS), password reset, onboarding store — extends `src/features/auth`                                    | none                   | `getdraft` + `Gyraya` auth              |
| `tabbars`               | ✅     | 5 swappable bottom-tab-bar variants (minimal/labeled/pill/floating/indicator) on headless `expo-router/ui`                        | none                   | `Gyraya` + `getdraft`                   |
| `push-notifications`    | ✅     | expo-notifications permission + token, owner-scoped `device_tokens` migration, tap-to-route, hook                                 | none (Expo push)       | build                                   |
| `media-upload`          | ✅     | expo-image-picker + PRIVATE Supabase Storage bucket, per-user folder RLS, signed URLs, upload hook                                | none                   | build                                   |
| `places-search`         | ✅     | Address autocomplete + reverse geocode via free OSM Nominatim, debounced hook; feeds `nav-turn-by-turn`                           | none (Nominatim)       | build                                   |
| `analytics`             | ✅     | PostHog typed event layer, screen tracking, ATT-free, PII guard, no-op without a key                                              | none (no-op in dev)    | build                                   |
| `ai-assistant`          | ✅     | Streaming LLM chat via a Supabase Edge Function (key server-side), RLS history, mock stream when key-free                          | none (mock in dev)     | build                                   |
| `forms`                 | ✅     | react-hook-form + Zod resolver + ControlledField bound to @/shared/ui (primitive, no route)                                       | none                   | build                                   |
| `offline-sync`          | ✅     | Network-state hook + persisted optimistic mutation queue that replays on reconnect (primitive)                                    | none                   | build                                   |
| `app-lifecycle`         | ✅     | Force-update/min-version gate + maintenance mode + timed review prompt, driven by a public config row                             | none                   | build                                   |
| `i18n`                  | ✅     | Lean localization: typed catalogs, t() interpolation, RTL, persisted locale (no heavy lib)                                        | none                   | build                                   |
| `feature-flags`         | ✅     | Supabase-driven remote flags + deterministic % rollout, cached, useFlag (primitive)                                              | none                   | build                                   |
| `activity-inbox`        | ✅     | In-app notifications: table + RLS, unread badge, realtime arrival, mark-read; pairs with push                                     | none                   | build                                   |
| `social-graph`          | ✅     | Follow/followers: edges + RLS, optimistic toggle, counts, isFollowing                                                             | none                   | build                                   |
| `comments`              | ✅     | Threaded comments on any entity: table + RLS, paginated, optimistic add/delete                                                    | none                   | build                                   |
| `search`                | ✅     | Postgres full-text search (tsvector + GIN) + ranked RPC, debounced hook                                                           | none                   | build                                   |
| `maps-view`             | ✅     | react-native-maps screen + key-free nearby query (bounding-box + haversine) over any lat/lng table                               | none (Apple Maps)      | build                                   |
| `booking-calendar`      | ✅     | Resources/availability/bookings + RLS, DB-enforced no-double-book, open-slot query, book/cancel                                   | none                   | build                                   |
| `cart-checkout`         | ✅     | Persisted cart + products/orders + place_order RPC that prices server-side (never trusts client)                                  | none                   | build                                   |
| `ratings-reviews`       | ✅     | Star ratings + reviews on any entity: RLS (one per user), average+count RPC, submit/list                                          | none                   | build                                   |

## Anatomy of a pack

See [`_TEMPLATE/`](_TEMPLATE/). Every pack has:

```
packs/<name>/
├── pack.json          # manifest: deps, env, migrations, routes, post-install notes
├── README.md          # what it does, how it's separated, what keys to ship
├── src/               # the code copied into src/features/<name>/ on install
│   ├── model/         # Zod schema + types
│   ├── data/          # data layer (Supabase queries, API clients, realtime)
│   ├── *-service.ts   # logic/services (key-free in dev)
│   ├── use-*.ts       # hooks
│   └── ui/            # MINIMAL swappable UI (replace after design)
└── supabase/          # migrations the pack needs (RLS-first), if any
```
