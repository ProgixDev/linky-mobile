---
id: architecture-backend
read-when: Touching auth, the Supabase client, database tables/migrations, RLS policies, Edge Functions, or payments.
owns: How the Supabase backend is wired and the secure-by-default rules for using it.
---

# Backend (Supabase)

The backend is Supabase, configured **RLS-first** (ADR-0007). The golden rule:
**the mobile client is untrusted and ships a public key — Postgres Row-Level
Security is the authorization boundary, not the client.** Evidence + deeper detail:
[`docs/research/03-supabase-security.md`](../research/03-supabase-security.md).

## Client

`src/shared/lib/supabase.ts` exports the configured `supabase` client. Security-critical
config (do not change without reading the comments there): session in
`LargeSecureStore` (AES + Keychain), `flowType: 'pkce'`, `detectSessionInUrl: false`,
`autoRefreshToken`, `lock: processLock`. `registerSupabaseAutoRefresh()` is called once
in `src/app/_layout.tsx`. Only the **anon/publishable** key is bundled; `env.ts` rejects
a service_role key.

## Auth

`src/features/auth` owns sign in / up / out, the session store (`useAuthStore`), and the
`useProtectedRoute` guard (wired into the root layout — unauthenticated users are sent to
`/sign-in`). Inputs are Zod-validated (`CredentialsSchema`). The visual design is a later
phase; the slice is the secure plumbing.

## Database — secure-by-default rules

Migrations live in `supabase/migrations/` and run in order. **Deny-by-default** is
enforced by `0001_security_baseline`:

- Blanket grants to `anon`/`authenticated` are revoked — a new table exposes nothing
  until you explicitly `grant` + add a policy.
- An **event trigger auto-enables RLS** on every new public table (so a raw-SQL table
  can't ship without RLS).
- A `private` schema holds `security definer` helpers (never API-exposed), with
  `search_path = ''` pinned.

### Adding a per-user table (copy `0003_notes`)

```sql
create table public.things (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- ... columns ...
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.things to authenticated;
create index things_user_id_idx on public.things (user_id);

create policy "things: select own" on public.things for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "things: insert own" on public.things for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "things: update own" on public.things for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "things: delete own" on public.things for delete to authenticated
  using ((select auth.uid()) = user_id);
```

Rules: one policy **per command** (never `FOR ALL`); always `to authenticated`; wrap
`auth.uid()` in `(select …)`; `WITH CHECK` on writes; index the policy column; never
read `user_metadata` in a policy (user-editable); split highly-sensitive columns into
their own table. Enforce MFA on a table with a restrictive policy:
`as restrictive ... using ((select auth.jwt()->>'aal') = 'aal2')`.

## Payments (entitlement is server-owned)

`public.subscriptions` is **client read-only** (no client write policy). The
`supabase/functions/revenuecat-webhook` Edge Function authenticates RevenueCat by a
shared-secret `Authorization` header (RevenueCat doesn't sign bodies), runs with
`verify_jwt = false`, and writes entitlement with the service_role key. Configure
RevenueCat `appUserID` = the Supabase user id. Gate premium features by joining
`subscriptions` in the feature's RLS policy. See
[`docs/research/06-payments-analytics-stack.md`](../research/06-payments-analytics-stack.md).

## Verification (release gates)

- `supabase test db` runs the pgTAP RLS tests in `supabase/tests/database/`.
- `supabase db lint` (Security Advisor) must be clean of ERROR lints — **0007**
  (policy exists, RLS disabled), **0013** (RLS disabled in public), **0015** (RLS
  references user_metadata). Treat these as release blockers.

## Setup (on your machine)

```
npx expo install   # reconcile native deps (incl. @supabase/supabase-js, url polyfill)
supabase init      # if you don't have a full config.toml yet
supabase start     # local stack
supabase db reset  # apply migrations
supabase test db   # run RLS tests
```

Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env`
(never the service_role key). Edge Function secrets via `supabase secrets set`.
