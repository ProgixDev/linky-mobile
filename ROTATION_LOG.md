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

## (f) Sign-off

When every row above has a successful verification and a confirmed-dead old-value probe, this log is **client-shareable as-is** (no secrets recorded, only metadata).

Closed on: _____________ — by: _____________
