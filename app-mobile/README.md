# Linky Mobile

V1 React Native mobile application for **Linky** — the Guinea-focused dual marketplace (products + real estate) with TikTok-style discovery, escrow payments, and integrated wallet.

This build is **frontend-only**. There is no backend yet. Every screen runs end-to-end on local mock data and in-memory state so the app feels alive on a real device for demos.

The design system, screen layouts and component library live in `/design/` at the repo root (HTML/CSS/JSX reference). Source of truth for every color, radius, type token and screen layout.

---

## Stack (locked — May 2026)

- **Expo SDK 55** · React Native 0.83 · React 19.2 · New Architecture
- **TypeScript 5.6** strict
- **Expo Router v6** with typed routes
- **NativeWind v4** + Tailwind 3.4
- **Reanimated v4** (worklets bundled — do **not** add `react-native-worklets/plugin`)
- **@shopify/flash-list v2** for the Découvrir feed
- **@gorhom/bottom-sheet** for filter & action sheets
- **expo-image**, **expo-video** (replaces removed expo-av), **expo-haptics**, **expo-linear-gradient**, **expo-camera**, **expo-secure-store**, **expo-localization**, **expo-blur**
- **Zustand v5** · **TanStack Query v5** · **react-native-mmkv** · **expo-secure-store**
- **react-hook-form v8** · **zod v4**
- **i18next** + react-i18next (French only loaded; scaffolding in place for more)

## Run it

```bash
cd app-mobile
npm install
npx expo prebuild --clean   # only the first time, or after native dep changes
npx expo run:ios            # iOS sim
npx expo run:android        # Android device / emulator
```

> MMKV requires a **dev build** — it does not run in Expo Go.

If `tsc --noEmit` warns about Cabinet Grotesk font family names, that's expected: the fonts are referenced by name in `src/theme/tokens.ts` but the actual font files are not bundled by default. Drop the `.otf`/`.ttf` files into `assets/fonts/` and uncomment the `useFonts(...)` block in `app/_layout.tsx`. Until then, the system font is used as the display font.

## Project structure

```
/app-mobile
├── app/                     Expo Router file-based routes
│   ├── (onboarding)/        Splash, welcome, auth, OTP, profile setup, done
│   ├── (tabs)/              5 bottom tabs (centre FAB is Découvrir)
│   ├── product/[id]         Product detail
│   ├── property/[id]        Property detail (with distance-to-road pill)
│   ├── shop/[id]            Shop profile
│   ├── cart, checkout       Cart + payment method
│   ├── order/[id]           Escrow tracking + hold-to-confirm
│   ├── wallet/              Wallet, Recharger, Retirer
│   ├── create/              Listing wizards (product + property)
│   ├── messages/            Conversation list + chat
│   ├── notifications        Categorized notification feed
│   ├── kyc/                 Intro → choose doc → camera capture → pending
│   ├── dispute/[orderId]    Issue wizard
│   └── settings/            Profile/theme/data-saver/phones
├── src/
│   ├── theme/               Tokens (ported from /design/styles.css), ThemeProvider
│   ├── components/
│   │   ├── primitives/      Button, Input, Chip, Switch, Avatar, Badge, Card,
│   │   │                    MoneyText, Skeleton, ProgressDots, SegmentedControl,
│   │   │                    HoldToConfirmButton, TrustStrip, Text
│   │   ├── feedback/        Toast, EmptyState, OfflineBanner
│   │   ├── lists/           ProductCard, PropertyCard, ShopMini, CategoryTile,
│   │   │                    SettingsRow, WalletGlanceCard, SectionHeader
│   │   ├── nav/             TopBar, BottomTabBar (custom, with centre FAB),
│   │   │                    SearchPill, StickyBottom
│   │   ├── sheets/          Sheet wrapper around @gorhom/bottom-sheet
│   │   └── discover/        DiscoverCard, DiscoverEnd
│   ├── stores/              Zustand: auth, prefs, cart, filters, favorites,
│   │                        createListing
│   ├── data/                Mock products/properties/shops/users/orders/
│   │                        conversations/notifications + photo URL bag
│   │   └── queries/         TanStack Query hooks with simulated 300-800ms latency
│   ├── lib/                 format, currency, haptics, analytics, storage
│   ├── icons/               Lucide-style SVG icon set (ported)
│   └── i18n/                fr.json + i18next config
└── assets/                  fonts, images
```

## Design system

**French only** for V1 (i18n scaffolding in place).

- All prices render through `<MoneyText amountGnf={...} />` — dual GNF + EUR with French thousands separator.
- All distances render through `formatDistance(meters)` — "À 250m du goudron" style.
- Conversion uses a static rate in `src/lib/currency.ts` (`1 EUR = 11000 GNF`). Replace with a live FX feed in V2.
- Light/dark themes share brand colors but switch surfaces. **Découvrir is always dark**, regardless of theme — the `discoverBg` token.

## Data layer

Every TanStack Query hook in `src/data/queries/` calls the real Supabase edge
functions via the `apiPost` wrapper (self-rolled JWT auth, French error
envelopes). The old in-memory `mockProducts.ts` / `mockProperties.ts` / … stores
were removed once the hooks were wired to the backend — there is no mock
fallback left. The full purchase flow (add to cart → checkout → escrow → wallet
movement) runs against live functions and the double-entry ledger.

## EAS builds

Configured in `eas.json` (`development`, `preview`, `production`). The `preview` profile produces an Android **APK** — that's the build for Abdoulaye to install:

```bash
npx eas login
npx eas init          # first time only — populates app.json projectId
npx eas build --platform android --profile preview
```

iOS preview build:

```bash
npx eas build --platform ios --profile preview
```

> Both consume EAS build credits. Skip them if you only need the Metro dev experience.

## Demo user

The signed-in user is **Mariama Diallo** from Conakry (Guinea, KYC-vérifiée). The onboarding flow accepts any 6-digit OTP — the moment you enter 6 digits in the OTP screen, the flow continues to profile setup.

After `Bienvenue, Mariama !` the app drops into the tab navigator. The cart is seeded with 3 items so the checkout flow is demoable immediately. The wallet has 850 000 GNF available.

## What is NOT in V1

- Real auth, real payments, real chat — mocked
- Delivery driver mode (V2)
- Real `react-native-maps` integration — placeholder schematic SVGs (`/property/[id]`, `/create/property/location`)
- Push notifications — the bell shows in-memory items
- Real AI description generation — `/create/product/details` shows a hardcoded sample with a 1.2 s fake load
- Languages other than French — i18next is scaffolded but only `fr.json` loaded

## Quality bar before delivery

```bash
npm run typecheck   # tsc --noEmit must pass
npm run lint        # eslint .
npx expo-doctor     # checks SDK + dependency compatibility
```
