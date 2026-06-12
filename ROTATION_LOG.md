# Linky V1 — Credential rotation log

Started: 2026-06-12 (Phase W.1).

These six secrets transited dev-session chat transcripts in plain text. Each is rotated as part of launch readiness. **Old values are not recorded here.** Each row tracks `date rotated · credential name · where applied · verification result`.

Sequence matters: rotate, update Supabase secrets / `.env`, redeploy the consuming fns, verify the new value works, **then probe with the OLD value to confirm it's dead**. The dead-probe is the load-bearing check.

`.env` writes use `[IO.File]::WriteAllText($path, $content, (New-Object Text.UTF8Encoding($false)))` (no BOM — the `supabase` CLI mis-parses files with a UTF-8 BOM).

---

## (a) Didit API key

| Field | Value |
|---|---|
| Rotated on | _____________ |
| Updated in | `supabase secrets set LINKY_DIDIT_API_KEY=<new>` |
| Fns redeployed | `kyc-start`, `kyc-status`, `kyc-callback`, `kyc-decide` |
| Verification | Real Didit verification session created from app → status reached `approved`. |
| Old-key probe | Curl Didit with the OLD key → expected: `401 invalid_api_key`. Result: __________ |

## (b) Didit webhook signing secret

| Field | Value |
|---|---|
| Rotated on | _____________ |
| Updated in | `supabase secrets set LINKY_DIDIT_WEBHOOK_SECRET=<new>` |
| Fns redeployed | `didit-webhook` |
| Verification | One real verification event delivered + processed (kyc_sessions row flipped). |
| Bad-signature probe | POST to `/didit-webhook` with a hand-forged signature → expected: HTTP 401 (NOT 200 — confirms the ack-only fallback did not silently reactivate). Result: __________ |

## (c) Stripe TEST keys + webhook secret

Three values rotate together: secret key, publishable key, webhook secret. The webhook endpoint URL itself doesn't change.

| Field | Value |
|---|---|
| Rotated on | _____________ |
| Updated in | `supabase secrets set LINKY_STRIPE_SECRET_KEY=<new_sk_test>`<br>`EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=<new_pk_test>` in `app-mobile/.env`<br>`supabase secrets set LINKY_STRIPE_WEBHOOK_SECRET=<new_whsec>` |
| Fns redeployed | `place-order`, `stripe-webhook`, `cancel-pending-payment`, `cron-poll-intents` |
| Verification | End-to-end card payment with 4242 → order flips `paid`. Cron sweep + stripe webhook both still respond 200 to a fresh delivered event. |
| Old-key probe | Curl Stripe `paymentIntents.create` with the OLD `sk_test` → expected: `401 invalid_api_key`. Result: __________ |

## (d) Supabase DB password

| Field | Value |
|---|---|
| Rotated on | _____________ |
| Updated in | Reset in the Supabase dashboard. **No place in the working toolchain embeds it** (migrations + queries go through the Management API with `SUPABASE_ACCESS_TOKEN`). |
| Verification | `git grep` the repo + `scripts\` for the OLD password BEFORE and AFTER the rotation → zero hits expected on both runs. |
| Post-rotation grep result | __________ |

## (e) SUPABASE_ACCESS_TOKEN

| Field | Value |
|---|---|
| Rotated on | _____________ |
| Updated in | `app-mobile/.env` → `SUPABASE_ACCESS_TOKEN=<new>` |
| Verification | Re-run one Management API query (e.g. `\scripts\v1-apply-migration.ps1`'s verify block, OR a no-op `select 1` via `/database/query`) → expected: HTTP 200. |
| Old-token probe | Same query with the OLD token → expected: 401. Result: __________ |

## (h) Stripe TEST keys (sk + pk + whsec) — DEFERRED to next build

| Field | Value |
|---|---|
| Status as of 2026-06-12 | **NOT rotated.** The current `pk_test_…` value bakes into the EAS preview APK shipping today (see eas.json env block). Rotating now would break this APK's card payments mid-demo. |
| Defer reason | Stripe publishable key is compiled into the JS bundle at EAS build time. Rotation requires : new keys in dashboard → updated secrets + .env + eas.json → new build → new APK install on every test device. Cannot land for today's delivery without re-cutting the build. |
| Next opportunity | The next EAS preview build (or the first production build). At that point : rotate `sk_test`, `pk_test`, recreate the webhook for a new `whsec`, update Supabase secrets + .env + eas.json env block + redeploy `place-order` `stripe-webhook` `cancel-pending-payment` `cron-poll-intents` + e2e 4242 verification + dead-probe old `sk_test`. |
| Risk profile until then | `pk_test_` is publishable-by-design (intended client-side). `sk_test_` lives only in Supabase secrets (never shipped, never in git). `whsec_` ditto. So the deferred surface is just the pk shipped in the APK + the sk_test held by the project — both manageable. |

## (i) EAS preview env block (build-time values in public git)

| Field | Value |
|---|---|
| Date | 2026-06-12 |
| What landed in public git history | `eas.json` `build.preview.env` block with literal values for `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`, `RNMAPBOX_MAPS_DOWNLOAD_TOKEN`. |
| Why this was acceptable | First 3 are designed to ship in clients (anon publishable key, Stripe publishable key, public Supabase URL) — they were always going to be in the APK bytecode visible to attackers running `apktool` anyway. The 4th is a rate-limited Mapbox access token (cheap to rotate). |
| Real exposure | `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` (`sk.eyJ…`) — a Mapbox secret token with `downloads:read` scope ; an attacker with this token could pull Mapbox SDK against the user's Mapbox account quota. |
| Mitigation path | Migrate the 4 designed-public values to remain inlined ; move `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` to EAS environment variables (`eas env:create --environment preview --name RNMAPBOX_MAPS_DOWNLOAD_TOKEN --value … --visibility secret`) before the next public push. Until then : rotate the Mapbox download token at Mapbox dashboard → tokens once the launch APK is in client hands. |

## (g) Supabase legacy HS256 JWT secret — DEFERRED to V1.1

| Field | Value |
|---|---|
| Status as of 2026-06-12 | **NOT rotated.** The value transited a dev session transcript during Phase X.11 wire-up of Realtime ; `LINKY_SB_JWT_SECRET` set on the project, `mint-realtime-jwt` v10 ACTIVE. |
| Why it can't be rotated now | This secret backs **three** consumers simultaneously : (1) `mint-realtime-jwt` for Supabase Realtime token signing, (2) the project's `anon` JWT (embedded in every shipped client — mobile, landing, admin), (3) the project's `service_role` JWT (used by every edge fn). Revoking it invalidates the anon key in every installed APK + every running session + every edge fn instantly. |
| Path to revocation | See `PHASE_K_V1_1_BACKLOG.md` § "X.11 — Supabase HS256 → asymmetric key migration". Migrate to publishable/secret API keys + ES256 realtime signing across all consumers, ship a release, THEN revoke. Estimated effort: L. |
| Until V1.1 ships | **DO NOT revoke** under any circumstance — taking the legacy secret offline = full backend outage. Treat it as a known-exposed credential whose rotation cost is launch-blocking. |
| Risk assessment | Reader of the dev transcripts could mint forged Linky-internal Supabase JWTs. Mitigated by : (a) the legacy secret is symmetric so misuse is limited to JWT forgery (no admin API access), (b) edge fns rely on `verify_jwt=false` + self-rolled `LINKY_JWT_SECRET` for auth (rotated separately above), (c) Realtime RLS policies gate per-row access regardless of who minted the token. Realistic exposure : a malicious actor with the transcripts could subscribe to Realtime channels for arbitrary user IDs. No write capability. |

## (f) Sign-off

When every row above has a successful verification and a confirmed-dead old-value probe, this log is **client-shareable as-is** (no secrets recorded, only metadata).

Closed on: _____________ — by: _____________
