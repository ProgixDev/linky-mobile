# ADR-0009 — expo-camera for in-app QR scanning

- **Status:** proposed
- **Date:** 2026-06-23
- **Deciders:** Achraf Benamrane (founder) — pending acceptance

## Context

Spec 002 (delivery QR-handoff) needs the driver to scan the buyer's on-screen order
QR to confirm delivery and release escrow. The app has no camera capability today.
The parked `packs/scan-barcode` pack already establishes the pattern with
**`expo-camera`** (`CameraView` + `useCameraPermissions`, `onBarcodeScanned`). Camera
is a native capability: it needs a config-plugin permission, a tailored store usage
string, and a dev/store build (it is not available in Expo Go), and it is App/Play
review surface.

## Decision

Adopt **`expo-camera`** as the single sanctioned camera/scanner for the app.

1. Install via `npx expo install expo-camera`; it is a managed Expo module (CNG
   config plugin owns the native bits — no hand-edited `ios/`/`android/`).
2. Camera permission is declared in `app.config.ts`: a **tailored**
   `ios.infoPlist.NSCameraUsageDescription` (a generic string is rejected at review;
   store-readiness STORE-APL-\* ), and Android `CAMERA` via the expo-camera plugin.
3. QR scanning restricts `barcodeScannerSettings.barcodeTypes` to `['qr']`.
4. Camera UI is **feature-local** (built in `src/features/deliveries`, reusing the
   `packs/scan-barcode` `CameraView`/`useCameraPermissions` pattern). The
   product-scanner pack is **not** installed wholesale (it is OpenFoodFacts-specific).
5. **Permission-denied is never a dead end:** the screen explains why and routes the
   driver to enable the camera (Settings) with a retry (spec 002 AC-6).

## Consequences

- Positive: one managed, well-supported camera path; permission handled by the
  expo-camera config plugin; pattern already proven in `packs/scan-barcode`.
- Negative / accepted trade-offs: camera requires a **dev build** (not Expo Go) and a
  fingerprint runtime bump → a store build when native bits change; camera is a
  privacy-sensitive permission, so the usage string and the deny path are part of
  scope. Live camera scanning is hard to drive in Maestro on a simulator, so the QR
  scan path is verified via `/verify-ui` (Argent) + a dev-only scan hook.
- Enforcement: the tailored usage string lives in `app.config.ts`; store-readiness
  check (`npm run store:check`) covers permission strings; the deny-path fallback is an
  acceptance criterion with a test.

## Alternatives considered

- **expo-barcode-scanner** — deprecated; its scanning merged into expo-camera. No.
- **react-native-vision-camera** — more capable but heavier, more native config and
  maintenance than a QR scan needs. Revisit only if we need advanced camera features.
- **No in-app scan (manual code only)** — infeasible: the handoff secret is a
  non-displayed UUID, so there is no human-typeable code to enter (see spec 002).
