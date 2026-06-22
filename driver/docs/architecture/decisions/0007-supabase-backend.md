# ADR-0007 — Supabase as the backend, RLS-first

- **Status:** accepted
- **Date:** 2026-06-18
- **Deciders:** Achraf Arabi (lead)

## Context

The skeleton was frontend-only (persistence was a painted-door stub). Apps built
from it need auth, a database, and payments, and they handle PII — so the backend
choice and its security posture are load-bearing. Research
([`docs/research/03-supabase-security.md`](../../research/03-supabase-security.md),
[`docs/research/06-payments-analytics-stack.md`](../../research/06-payments-analytics-stack.md))
selected Supabase, with the decisive constraint that a mobile client ships a
**public** anon key, so **Row-Level Security — not key secrecy — is the only real
authorization boundary**. The most common real-world breach for apps like ours is a
table reachable by `anon`/`authenticated` with RLS disabled (CVE-2025-48757; an
11% exposure rate across scanned indie apps).

## Decision

Adopt Supabase with a **secure-by-default** data layer:

1. **Deny-by-default DB.** Migration `0001` revokes blanket grants to the API roles,
   adds a non-exposed `private` schema for `security definer` helpers, and installs
   an **event trigger that auto-enables RLS on every new public table**. Access is
   opt-in per table (explicit `grant` + a policy).
2. **Owner-scoped policy pattern** (migration `0003_notes`, the canonical example):
   one policy per command, `to authenticated`, `(select auth.uid())` wrapped,
   `WITH CHECK` on writes, policy column indexed. `auth.users` is never exposed —
   only a mirrored `public.profiles` (migration `0002`).
3. **Entitlement is server-owned** (migration `0004_subscriptions`): clients get
   RLS **SELECT-only**; no client write policy exists, so only the payments webhook
   (service_role, which bypasses RLS) writes subscription state.
4. **Client** (`src/shared/lib/supabase.ts`): session stored in `LargeSecureStore`
   (AES + Keychain, not AsyncStorage), `flowType: 'pkce'`, `detectSessionInUrl:false`,
   `autoRefreshToken`, `lock: processLock`, AppState refresh. Only the
   anon/publishable key is bundled (env.ts rejects a service_role key).
5. **Auth feature slice** (`src/features/auth`): Zod-validated sign in/up/out, a
   session store, and a `useProtectedRoute` guard wired into the root layout.
6. **Verification:** pgTAP RLS tests (`supabase test db`) assert the invariants, and
   `supabase db lint` (Security Advisor) is a release gate — block on ERROR lints
   0007/0013/0015.

## Consequences

- Positive: a forgotten policy cannot silently leak data; the secure pattern is the
  path of least resistance (copy `notes`); payments can't be spoofed from the client.
- Negative: every new table needs its grant + policies written deliberately (this is
  the point); contributors must understand RLS — see
  [`docs/architecture/backend.md`](../backend.md).
- Follow-ups (later phases): MFA-in-RLS (`aal2` restrictive policies), leaked-password
  protection + CAPTCHA, asymmetric JWT signing keys, storage-bucket policies.

## Alternatives considered

- **Firebase** — weaker relational/RLS story for the owner-scoped pattern we want.
- **Custom API server** — more control, far more to build/secure; revisit only if a
  specific app outgrows Supabase. Record a superseding ADR if so.
