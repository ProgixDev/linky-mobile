# Pack: scan-barcode

A barcode/QR scanner that looks products up in **OpenFoodFacts** — a free, public, **key-free** API.
Build the whole LIBOU-style food-scan flow with no account. Logic-first; the UI is a placeholder.

## What you get

- `data/openfoodfacts.ts` — `lookupProduct(barcode)` → typed `ScanResult` (`found` / `not_found` /
  `error`). Never throws; validates the untrusted JSON with Zod (`model/product.ts`).
- `useBarcodeScanner()` — camera permission, a debounce lock (one lookup per barcode), the lookup,
  and history. The UI just renders a camera + this state.
- `useScanStore` — recent scans, deduped + capped, persisted (non-sensitive → app storage), with
  validated rehydration.
- `ScanScreen` — a **placeholder** scanner (`DESIGN: replace after Claude Design`) proving the flow.

## Install

```
/add-feature scan-barcode
npx expo install expo-camera     # needs a dev build (camera isn't in Expo Go fully)
```

Add a **tailored** camera usage string (store-readiness requires it — generic strings get rejected):

```ts
// app.config.ts → ios.infoPlist
NSCameraUsageDescription: 'Scan a product barcode to look up its nutrition.';
```

Use it:

```ts
const { history } = useScanStore(); // recent scans
const result = await lookupProduct('737628064502'); // or via the screen/camera
```

## Swap the data source

OpenFoodFacts is food-specific. For a different catalog (retail, your own DB), keep
`model/product.ts` + `useBarcodeScanner` and replace only `data/openfoodfacts.ts`.

## Notes

- Supported codes: EAN-13/8, UPC-A/E, QR (edit `barcodeTypes` in the screen).
- No keys, no backend required. To persist scans server-side, add an RLS-scoped table (copy the
  `notes` pattern in `docs/architecture/backend.md`).
