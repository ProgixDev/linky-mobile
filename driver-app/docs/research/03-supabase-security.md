---
id: research-supabase-security
read-when: Implementing Phase 2 (Supabase secure reference) — RLS, auth on Expo, keys, Edge Functions, DB hardening, payments→DB.
owns: Verified Supabase secure-by-default patterns + RLS cheat-sheet.
---

# Supabase Production Security for Expo — 2025–2026

**Mental model:** the mobile client ships a _public_ key, so **Row-Level Security in Postgres —
not key secrecy — is the only real boundary.** ([api-keys](https://supabase.com/docs/guides/api/api-keys))

## 1. RLS

- **Enable RLS on every table in an exposed schema.** RLS enabled + no policy = denies all (safe). RLS _not_ enabled but granted = fully open to `anon` (the dangerous mode). Tables created via raw SQL do NOT get RLS auto-enabled. ([RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [securing-your-api](https://supabase.com/docs/guides/api/securing-your-api))
- **One policy per command** (never `FOR ALL`). SELECT→USING; INSERT→WITH CHECK; UPDATE→both; DELETE→USING. UPDATE also needs a matching SELECT policy.
- **Pitfalls that leak data:** missing `WITH CHECK` (user rewrites others' rows); `using(true)` on sensitive tables; missing `TO authenticated` (anon hits policy); **views bypass RLS** unless `security_invoker=true`; **never read `user_metadata`** in a policy (user-editable — lint 0015 ERROR); `service_role` bypasses RLS entirely.
- **Performance:** wrap auth calls in `(select auth.uid())` → initPlan caching (179ms→9ms on 100K rows); **index every policy column**; `TO authenticated` short-circuits for anon; rewrite joins to `team_id in (select …)`; add the explicit client filter too.
- **Test with pgTAP** in `supabase/tests/database/` via `supabase test db` (`policies_are`, `policy_cmd_is`, `results_eq`).

## 2. Auth on Expo

- Session storage: **LargeSecureStore** (AES-256 key in SecureStore, encrypted session in AsyncStorage) — works around the SecureStore ~2KB limit. Deps: `aes-js`, `react-native-get-random-values`, `expo-secure-store`. ([RN auth blog](https://supabase.com/blog/react-native-authentication))
- Client config: `storage: LargeSecureStore`, `autoRefreshToken`, `persistSession`, `detectSessionInUrl:false` (native), `flowType:'pkce'`, `lock: processLock`. Register AppState auto-refresh (native).
- **PKCE deep links:** code valid 5 min, one-time, same-device → `exchangeCodeForSession`. Register `expo.scheme` + redirect URL allowlist. The official native example uses _implicit_ flow — **don't copy it; use PKCE.**
- **Refresh rotation** on by default (single-use, reuse-detection revokes the session family). Don't change the 10-second reuse interval.
- **MFA:** enforce in the DB, not just UI — `as restrictive` policy on `(select auth.jwt()->>'aal') = 'aal2'`.
- **Leaked-password protection** (HaveIBeenPwned, Pro plan) + **CAPTCHA** (hCaptcha/Turnstile) on auth endpoints.

## 3. Keys

- **anon/publishable** = public by design, RLS-bound, safe in the bundle. **service_role/secret** = `BYPASSRLS`, full access, NEVER in a client. New keys go in the `apikey` header.
- With the anon key an attacker hits PostgREST and reads/writes **anything not protected by RLS** → RLS is the boundary.
- **2024-2026 migrations** (legacy keys deprecated end of 2026): anon/service_role → publishable/secret keys; symmetric JWT secret → **asymmetric signing keys** (ES256, local verify via JWKS + `getClaims()`).

## 4. Edge Functions

- `verify_jwt` ON for user-invoked functions (validates JWT before your code); OFF for webhooks (verify the provider secret yourself).
- Authenticate with `auth.getUser(jwt)` or `auth.getClaims()`. Forward the caller's `Authorization` so RLS applies.
- Input validation: `zod`/`valibot` `safeParse` on `req.json()` → 400 on failure. Secrets via `Deno.env.get` + `supabase secrets set`. Rate limit via Upstash Redis. Restrict CORS origin in prod.

## 5. DB hardening

- Lock down exposed schemas; keep sensitive tables + security-definer helpers in a non-exposed `private` schema; never expose `auth.users` (mirror to `public.profiles` via trigger).
- **Revoke default grants** to anon/authenticated/service_role (Supabase is moving to this default in 2026 — opt in now).
- Pin `set search_path = ''` on functions (lint 0011).
- **Security Advisors / Splinter linter** (`supabase db lint`) — treat ERROR lints as release blockers: 0007 (policy exists, RLS disabled), 0013 (RLS disabled in public), 0015 (RLS references user_metadata).

## 6. Storage & Realtime

- **Private buckets by default**; per-user folder policy via `(storage.foldername(name))[1] = (select auth.uid())::text`; short-lived **signed URLs**; set `fileSizeLimit` + `allowedMimeTypes`.
- **Realtime:** private channels, RLS on `realtime.messages`; prefer Broadcast-from-database over Postgres Changes (DELETE events bypass RLS).

## 7. Real incidents (motivate RLS-first)

- **CVE-2025-48757** — Lovable apps called PostgREST with the anon key relying on RLS; many tables had missing policies → unauthenticated reads of entire tables; 303 endpoints / 170 projects exposed. ([writeup](https://mattpalmer.io/posts/2025/05/CVE-2025-48757/))
- **SupaExplorer Jan 2026** — 11% of 20K launch URLs exposed Supabase creds in frontend code; worst shipped the service_role key in the browser.
- Note: RLS is row-level — a row mixing payment + non-sensitive data still exposes sensitive columns → **split sensitive data into its own table.**

## 8. Payments → Supabase (never trust client)

- Client gets **RLS SELECT-only** on its own entitlement row; no client write policy → writes denied by default; the **webhook writes with service_role**.
- RevenueCat → Edge Function (`verify_jwt=false`) + verify the **Authorization header secret** (RevenueCat doesn't sign bodies); idempotent on event `id`; re-fetch `GET /subscribers` for truth.
- Stripe → verify `Stripe-Signature` against the **raw body** with `constructEventAsync`.

## 9. Secure-by-default for the skeleton

1. RLS on every table + auto-enable event trigger; CI blocks on lints 0007/0013/0015.
2. Never ship service_role in the app; build-time grep guard.
3. Owner-scoped policies with `(select auth.uid())`, `TO authenticated`, `WITH CHECK`.
4. LargeSecureStore tokens; full auth option set.
5. PKCE OAuth deep links.
6. Payments via signature/secret-verified webhooks; entitlement table client-read-only.
7. Migrate to publishable/secret keys + asymmetric JWT now.
8. Lock down schemas; never expose `auth.users`.
9. Private buckets + short-lived signed URLs.
10. Private Realtime channels.
11. MFA in RLS; leaked-password protection; CAPTCHA.
12. Edge Functions: getUser/getClaims + zod + secrets + rate limit + CORS.
13. pgTAP RLS tests + Security Advisor as release gates.

## RLS cheat-sheet

```sql
alter table public.t enable row level security;
-- owner-scoped CRUD (the workhorse)
create policy "select own" on public.t for select to authenticated
  using ( (select auth.uid()) = user_id );
create policy "insert own" on public.t for insert to authenticated
  with check ( (select auth.uid()) = user_id );
create policy "update own" on public.t for update to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );   -- blocks ownership reassignment
create policy "delete own" on public.t for delete to authenticated
  using ( (select auth.uid()) = user_id );
-- enforce MFA (restrictive, applies on top)
create policy "require aal2" on public.t as restrictive to authenticated
  using ( (select auth.jwt()->>'aal') = 'aal2' );
-- read-only entitlement (writes => webhook/service_role only)
create policy "read own subscription" on public.subscriptions for select to authenticated
  using ( (select auth.uid()) = user_id );
-- storage per-user folder
create policy "own folder" on storage.objects for all to authenticated
  using ( bucket_id='user-files' and (storage.foldername(name))[1]=(select auth.uid())::text )
  with check ( bucket_id='user-files' and (storage.foldername(name))[1]=(select auth.uid())::text );
```

**Golden rules:** one policy per command · always `TO authenticated` · wrap auth calls in `(select …)` · index policy columns · INSERT/UPDATE need WITH CHECK · never read user_metadata · views need security_invoker · UPDATE needs a SELECT policy.
