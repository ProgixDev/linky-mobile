# Pack: payments-revenuecat

RevenueCat in-app purchases / subscriptions — the **client side**, separated and ready to drop in.
The **server** half already ships in the skeleton: `supabase/functions/revenuecat-webhook` +
the `subscriptions` table (RLS read-only), so entitlement is server-owned.

## What you get (logic-first)

- `configureRevenueCat(appUserId?)` — one-call SDK init. **Key-free in dev** (no key → Preview/sandbox
  mode mocks offerings, so you can build and test the whole flow without an account).
- `getOfferings()` / `purchase(pkg)` / `restorePurchases()` — the purchase flow, error-handled
  (incl. user-cancel), returning a typed `Entitlement`.
- `useEntitlement()` → `{ isPremium, entitlement, loading, refresh }` — gate any UI on it, live.
- `EntitlementSchema` (Zod) + `model/entitlement.ts` types.
- `PaywallScreen` — a **placeholder** paywall (tagged `DESIGN: replace after Claude Design`) that
  proves the flow end to end. Real design drops onto the same hooks.

## Install

```
/add-feature payments-revenuecat
# then:
npx expo install react-native-purchases        # needs a dev build for real purchases (not Expo Go)
```

Call once at startup (e.g. `src/app/_layout.tsx`), and pass the Supabase user id after sign-in so
RevenueCat and the server `subscriptions` row share the same `app_user_id`:

```ts
import { configureRevenueCat } from '@/features/payments';
configureRevenueCat(session?.user.id);
```

Gate a screen:

```ts
const { isPremium } = useEntitlement();
if (!isPremium) router.push('/paywall');
```

## Keys (only to ship — dev is keyless)

- `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (appl*…) and `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` (goog*…) —
  RevenueCat **public** SDK keys, safe on device. Add them to `src/shared/lib/env.ts` on install.
- Server: the webhook shared secret (`REVENUECAT_WEBHOOK_SECRET`) — already wired server-side.

## Security

Entitlement that matters is enforced **server-side** (the `subscriptions` table written by the
verified webhook). The client value is for UX only — never trust it for real access (see
`docs/architecture/backend.md` and `docs/research/06-payments-analytics-stack.md`).

## Apple/Play compliance

The paywall must show price + what-you-get + **Restore** + Terms/Privacy, and subscriptions must
disclose auto-renew (the `store:check` + `docs/store/checklist.md` cover this). `restorePurchases()`
is included; the rest is design/metadata.
