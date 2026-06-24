# Exec Plan — Driver UI/UX overhaul (welcome → 3-tab shell → map → profile → icon)

- **Date:** 2026-06-24
- **Author:** agent + owner
- **Intent:** owner prompt "pro UI/UX overhaul" — premium, on-brand Linky Driver matching the global app.
- **Status:** in-progress

## Goal & non-goals

**Done** = a premium, on-brand app: animated welcome → get-started → branded French OTP auth → a 3-tab shell (Accueil / Carte / Profil) behind the approved-livreur gate, where the courier filters deliveries with live deadline countdowns, sees each client's exact location on a live Mapbox map and navigates to scan the handoff QR, and edits their profile — plus a distinct green Linky-Driver app icon, and an installable preview APK with the live backend baked in.

**Non-goals:** pushing the driver's live location to the buyer for buyer-side tracking (future backend phase); the three backend asks below (build UI to their shapes, degrade gracefully).

## Already exists — reuse, do not recreate

- `src/features/deliveries/*` — worklist + scan→confirm handoff (done, do not rebuild; restyle only).
- `src/features/auth/*` — OTP request/verify logic (UNTOUCHED; restyle UI only).
- `src/features/onboarding/*` — approval gate (`use-livreur-gate`, wired in `src/app/_layout.tsx`); tabs sit behind it.
- `src/shared/ui/*` (button, card, screen, text, text-field, empty-state, skeleton), `src/shared/theme/colors.ts` (brand500 `#0E6E55`, accent `#E8A53D` — already on-brand), `src/shared/lib/storage` (`appStorage`).
- Packs to reuse: `packs/tabbars` (headless expo-router/ui, no native dep), `packs/maps-view` (logic only — renderer swapped to Mapbox), `packs/profile-settings`, `packs/places-search` (geocode), `packs/nav-turn-by-turn` (route line).

## Constraints discovered (drive the slice order)

- **No simulator/Argent on this host (Windows):** visual QA is on-device via Metro (JS slices) or the rebuilt APK (native slices). Screenshots are owner-supplied for the PR.
- **Native deps are all absent** (`expo-location`, `@rnmapbox/maps`, `react-native-svg`, `expo-linear-gradient`, `expo-haptics`) → batch into ONE native slice + ONE new dev/preview build. `@gorhom/bottom-sheet` is JS-only (reanimated + gesture-handler present).
- **Mapbox token:** reuse the global app's `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` + `RNMAPBOX_MAPS_DOWNLOAD_TOKEN`; add to `eas.json` env (per the env-inlining fix) + `env.ts`.

## Backend asks (route to the global Linky session; UI degrades if absent)

1. Buyer **lat/lng** on `list-livreur-deliveries`/`get-delivery` → exact pins. Fallback: Mapbox geocode the address.
2. Delivery **`deadlineAt`** (or SLA hours) → countdown. Fallback: `assignedAt + 24h`.
3. **Livreur profile-update** endpoint → save edits. Fallback: stub save with a TODO.

## Tasks / Phases (committed slices)

### Phase 1 — Brand + first impression (JS-only; QA via Metro)

- [ ] S1 — `LinkyMark` shared component (View-based green Λ) + restyle OTP auth to French/"tu" + branded header, logic + testIDs untouched → `src/shared/ui/linky-mark.tsx`, `src/features/auth/ui/sign-in-screen.tsx`.
- [ ] S2 — animated welcome (Reanimated, skippable, reduced-motion) + get-started hero + « Commencer », once-per-install flag in `appStorage`, pre-auth routing → `src/features/welcome/*`, `src/app/welcome.tsx`, `src/app/get-started.tsx`, `_layout.tsx`.

### Phase 2 — Navigation shell + content (JS-only; QA via Metro)

- [ ] S3 — `tabbars` pack → `(tabs)/_layout` Accueil/Carte/Profil behind the gate.
- [ ] S4 — Accueil premium cards + segmented filters (À récupérer/En cours/Urgent/Aujourd'hui/Terminées) + search + per-card countdown.
- [ ] S5 — Profil: `profile-settings` shell, edit + Zod, stub save, sign-out + Approuvé badge.

### Phase 3 — Native: map + icon (needs a new dev build)

- [ ] S6 — batch native deps + ADR; Carte: live driver marker (`watchPosition`), client pins (coords/geocode), tap→bottom-sheet (countdown + Scanner), route line + recenter.
- [ ] S7 — green Linky-Driver icon: SVG master → iOS 1024 + Android adaptive (fg/bg/mono) + splash; wire `app.config.ts`.
- [ ] S8 — rebuild dev-client + preview APK; grep bundle for `fvvqgcsphwrmdlclnxcz`; report install URLs.

## Risks & landmines

- Pre-auth routing must not fight `useProtectedRoute`/`useLivreurGate` (welcome/get-started are allowed unauth routes; gate precedence).
- Mapbox needs the download token at build time + a fresh dev build (won't render in the current installed APK).
- Icon must read crisply at 48px + as a themed monochrome; verify before shipping.
- Countdown/pins are on fallbacks until backend asks land — keep them visibly graceful, never fake precision.

## Verification

- [ ] `npm run verify` green per slice.
- [ ] Owner walks each new screen on-device (Metro for JS slices, APK for native) — screenshots to the PR.
- [ ] Docs updated; ADR for the map/native-dep choice.
