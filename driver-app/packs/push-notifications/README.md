# Pack: push-notifications

Expo push notifications, end to end: ask permission, get the device's Expo push token, store it
server-side (owner-scoped RLS), and route taps to a deep link. Logic-first; UI is a placeholder.
**Key-free** — Expo issues the token and relays the push; no FCM/APNs keys live in the app.

## What you get

- `services/push.ts` — `getExpoPushToken` (permission + token, never throws), `configureForegroundBehavior`.
- `data/token-repo.ts` — `saveDeviceToken` (upsert, RLS-scoped) / `removeDeviceToken` (call on sign-out).
- `usePushNotifications(onOpenRoute)` — registers on mount, stores the token, routes taps via the
  validated payload (`PushDataSchema`).
- `model/notification.ts` — Zod schemas for the token row and the tap payload.
- `NotificationsScreen` — **placeholder** that shows the registration state.
- `supabase/0010_push.sql` — `device_tokens` table, owner-scoped RLS (select/insert/update/delete).

## Install

```
/add-feature push-notifications
npx expo install expo-notifications expo-device
# apply supabase/0010_push.sql into supabase/migrations/, then:
supabase db reset
```

Push requires a **dev or standalone build** (not Expo Go on Android). On sign-out call
`removeDeviceToken(token)` so the device stops receiving the previous user's pushes.

## Sending pushes (server side, key-free)

Read the user's tokens from `device_tokens` on your server and POST to Expo's push API
(`https://exp.host/--/api/v2/push/send`). No key sits in the app. Attach a small `data.route`
(e.g. `"/chat/123"`) so a tap deep-links — the route is validated through the deep-link gate
(`docs/research/01-mobile-security.md`).

## Security

Push payloads are **not a secure channel** — never put tokens, PII, or secrets in them. The token
table is owner-scoped (a user reads/writes only their own rows). Tap routes are validated before
navigation so a crafted payload can't deep-link somewhere unexpected.
