# ADR-0010 — Mapbox (@rnmapbox/maps) for the live delivery map

- **Status:** proposed
- **Date:** 2026-06-24
- **Deciders:** Achraf Benamrane (founder) — pending acceptance

## Context

The Carte tab (exec-plan 2026-06-24-driver-ui-overhaul, slice 6) needs a real-time
map: the courier's own live position (foreground `watchPosition`), a pin per assigned
client, a route to the selected client, and a tap → bottom sheet that opens the
scan-handoff flow. The global Linky marketplace app already renders maps with
**Mapbox** (`@rnmapbox/maps`), and its EAS env already holds the Mapbox tokens
(`EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`, `RNMAPBOX_MAPS_DOWNLOAD_TOKEN`). The parked
`packs/maps-view` ships a key-free renderer on `react-native-maps` (Apple/Google
Maps) — a different engine from the global app.

## Decision

Adopt **`@rnmapbox/maps`** for the driver map, matching the global app (one map
engine, shared styling, shared tokens) rather than the `react-native-maps` pack.

1. Install via `npx expo install @rnmapbox/maps expo-location` (managed; CNG config
   plugin owns the native bits — no hand-edited `ios/`/`android/`).
2. **Tokens.** `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` (public `pk.`) is inlined for runtime
   tiles — it ships in `eas.json` `env` + `env.ts` (public by design). The
   `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` (secret `sk.`, DOWNLOADS:READ) is build-time only and
   **must never be committed** — it lives in the EAS environment (secret visibility)
   and the local `.env` (git-ignored), and is read by the `@rnmapbox/maps` config
   plugin at build time. `secrets:check` stays green.
3. **Location.** `expo-location` foreground `watchPosition`; permission requested with a
   clear rationale and a no-dead-end deny path (Settings deep-link), mirroring the
   camera ADR-0009 pattern.
4. **Exact client pins need backend coords (ask #1).** The deliveries list exposes only
   the dropoff AREA (city · district), never the street (spec 001 AC-10), and carries no
   lat/lng yet. Until the backend returns coordinates, pins are **geocoded from the area
   via the Mapbox Geocoding API** → approximate, clearly the fallback. When `lat/lng`
   ships, swap geocoding for the exact point.
5. Map UI is **feature-local** (`src/features/map`); the `packs/maps-view` renderer is
   not installed (wrong engine).
6. Pushing the driver's live location to the buyer (buyer-side tracking) is a FUTURE
   backend phase — out of scope here.

## Consequences

- Positive: one map engine across both Linky apps; shared tokens/styling; richer than
  Apple/Google Maps for custom pins + routes.
- Negative / accepted: `@rnmapbox/maps` is native → a **dev build** (not Expo Go) + a
  fingerprint bump; the secret download token adds build-config handling; map
  correctness is **visual**, so it's verified on-device / via `/verify-ui` (Argent), not
  unit tests. Geocoded pins are approximate until backend coords land.
- Enforcement: `secrets:check` guards against committing the `sk.` token; the deny-path
  fallback is an acceptance criterion; the geocode fallback is isolated behind one
  helper so swapping to real coords is a one-line change.

## Alternatives considered

- **react-native-maps (`packs/maps-view`)** — key-free + already packaged, but a
  different engine from the global app (Apple/Google Maps), so styling + behaviour would
  diverge. Rejected for consistency.
- **No map (list only)** — the spec requires a live map with exact client locations and
  in-map navigation to the handoff. Rejected.
