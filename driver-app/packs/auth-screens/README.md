# Pack: auth-screens

Extra auth flows on top of the skeleton's password sign-in (Phase 2): **passwordless OTP** (email +
SMS), **password reset**, and **onboarding**. Logic-first; UI is a placeholder. **Key-free** to build.

## What you get

- `auth-extras.ts` — `sendEmailOtp` / `sendPhoneOtp` / `verifyEmailOtp` / `verifyPhoneOtp`,
  `requestPasswordReset`, `updatePassword` (all over `supabase.auth`, error-handled).
- `model/auth.ts` — Zod validators (email, E.164 phone, OTP code, new password).
- `useOnboardingStore` — multi-step onboarding answers + completion flag, persisted with validated rehydration.
- `OtpScreen` (email **or** phone), `ForgotPasswordScreen`, `OnboardingScreen` — **placeholder** screens proving each flow.

## Install

```
/add-feature auth-screens
```

Requires the **auth** from Phase 2. Use:

```tsx
<OtpScreen channel="phone" onVerified={() => router.replace('/')} />
<ForgotPasswordScreen />
<OnboardingScreen onDone={() => router.replace('/')} />
```

## Keys / config (dashboard, not app keys)

- **Email OTP + password reset** — work on the Supabase **free tier**, no keys.
- **SMS OTP** — configure an SMS provider (Twilio/MessageBird) in the **Supabase dashboard** to
  actually deliver codes. That's a project setting, not a key in your app.
- **Password reset redirect** — set the reset redirect URL (your verified deep link) in Supabase
  Auth settings so the email link returns to the app (see the deep-link gate in
  `docs/research/01-mobile-security.md`).

## Security

Use the **system browser** for any OAuth (the skeleton bans embedded WebViews), and route the auth
callback through a **verified** Universal/App Link, not a bare custom scheme
(`docs/security/checklist.md` SEC-AUTH-001/002). OTP codes are single-use and short-lived server-side.
