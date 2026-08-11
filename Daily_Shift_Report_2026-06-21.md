# Daily Shift Report — Double Shift (Linky + GetDraft)

**Linky shift:** 2026-06-21 — real email OTP, auth login-not-signup, Discover reel, dark-mode UI, cutover prep, demo APK
**GetDraft shift:** 2026-06-20 (shift 2) — prod verification, migration 026, Render→Railway migration, demo prep
**Companions:** `Daily_Shift_Report_2026-06-19.md` (prev double shift) · `GetDraft_Daily_Report_2026-06-20.md` (GetDraft full)

---

## 🌍 Global TL;DR

- **Linky** — Real **email OTP delivery is LIVE** (Gmail SMTP via the landing relay, 5/5 200). Existing users now **log in directly instead of re-signing-up** (`was_created`). Shipped **4 Discover-reel fixes** (incl. a new property-favorite backend), **fixed invisible dark-mode icons**, scoped the full **production data-wipe** (ran PART B, deferred PART A per owner), and cut a **verified demo APK** (versionCode 5, expoborz). Backend changes are live + backward-compatible. **Demo-ready.**
- **GetDraft** — Shift-1 code fixes **verified live in prod**, ranking **migration 026 applied**, and the backend is **migrating off Render's free tier onto Railway PRO** (kills cold-starts + likely unblocks SMTP). Email/phone delivery **parked on the client**. Demo-ready with existing accounts.

**Overall: ✅ Both demo-ready. 🚀 Linky APK building. 🚧 GetDraft Railway migration in progress. ⏸️ GetDraft email/phone client-gated.**

---

# PART 1 — LINKY (2026-06-21)

**Focus:** real email OTP, auth UX, Discover reel, dark-mode contrast, production-cutover prep, demo APK.

## ✅ Real email OTP — LIVE
- Chain: app → `otp-request` edge fn → POST `${LANDING_OTP_URL}/api/send-otp` (header `x-otp-secret`) → landing `email.ts` nodemailer → **Gmail SMTP** (`smtp.gmail.com:465`, sender `achraf27arabi@gmail.com`, app password).
- **Direct endpoint test: 5/5 HTTP 200** — Gmail-on-Vercel is reachable + consistent.
- Supabase secrets `LANDING_OTP_URL` + `OTP_EMAIL_SECRET` set → `otp-request` takes the **real-delivery branch** (returns `otp_id`, **no `dev_code`**).
- **Root-caused a 5/5 401:** PowerShell `$val | vercel env add` appends a trailing newline → mangled the secret. Fixed by setting via `cmd /c "vercel env add NAME production < file"` (no trailing newline) + redeploy.
- **Phone OTP still uses the dev_code stub** (no SMS provider yet).
- ⏳ Final inbox-landing + a real emailed code verifying pending a user-controlled inbox test.

## ✅ Auth: log in, don't re-signup (cutover PART B) — commit `5964660`
- `find_or_create_user_with_phone/_with_email` already returned `(id, was_created)` and never duplicated rows — the edge fn was **discarding `was_created`**.
- `otp-verify` (v26, live, `--no-verify-jwt` + probed) now surfaces `was_created`. Mobile branches: **`was_created=false` → skip profile-setup** (no name/role overwrite) + "Bon retour 👋"; **true** → profile-setup (new user). Signup-with-existing-account resolves into the existing account too.

## ✅ Discover reel — 4 fixes — commits `a002239` (backend) + `a00be02` (mobile)
1. **Likes persist + count moves** — wired to the server: products → `product-favorite-toggle`, properties → **new `property_favorites` table + `toggle_property_favorite` RPC + `property-favorite-toggle` edge fn (live v1)**; optimistic +1/−1 + rollback; double-tap too.
2. **Manual photo swipe** — removed the 4s auto-rotate; photos are a horizontal `FlatList` (pagingEnabled); vertical reel still owns up/down.
3. **"See details" CTA** → brand green + white bold.
4. **Removed the redundant "Details" rail button** (rail = like + share).

## ✅ Dark-mode icon contrast — commit `08e6f2d` (caught by pre-build verification)
- `ProductCard` heart + shop `back`/`share` were `colors.text` on white circles → **invisible in dark mode**. Fixed to dark literals. (`product/[id].tsx` was already correct.)

## ✅ Self-action UX — commit `bed4389`
- Own shop → "Gérer ma boutique"; own product/property → manage CTA, not buy/contact/visit.

## 🚧 Production cutover PART A (full data wipe) — DEFERRED by owner
- Investigated live DB (39 users + all data). Single-transaction wipe SQL drafted: deletes all non-admin data, **preserves the admin + the demo-seed trigger + schema**, re-seeds the admin wallet.
- **Owner chose to keep data** for today's client demo. SQL ready to run later (after sorting admin/test accounts).

## 🔑 Admin access — clarified
- Admin panel logs in with **email + PASSWORD** (`email-signin`; the "2FA code" screen is a visual pass-through) — **NOT OTP**. So the email-OTP change never threatened admin access.
- `adminlinky@gmail.com` has a bcrypt password. (Briefly added then removed a phone after a mistaken "locked-out" premise — admin left exactly as it was.)

## 📦 Demo APK — building
- **Pre-build verification workflow** (commits + typecheck + backend probes + code-presence) → green after the contrast fix.
- Cut **EAS preview build `f7de0f13`** — versionCode **5**, account **expoborz**, keystore `tL2U4yoGKP` (same → **updates in place**, no uninstall). Building at report time → will be downloaded + shipped to `linky-gn.vercel.app/linky.apk`.

## ⏸️ Linky — parked / gated
- **Phone OTP** — needs an SMS provider (Orange SMS API / Twilio failover).
- **Push notifications** — needs APNS key (iOS) + `google-services.json` on EAS (Android standalone).
- **Email inbox-delivery** — send proven (5/5 200); inbox-landing confirmation pending.

## Linky — what's next
1. Confirm a real email lands in a controlled inbox (in-app test).
2. When `f7de0f13` finishes → download + ship to the landing.
3. Run PART A data wipe when the owner is ready.

## Linky — gotchas logged
- Vercel env CLI reads these vars back **blank** (sensitive) — verify via the live endpoint, not `env pull`.
- PowerShell stdin pipe to `vercel env add` appends a newline → mangles secrets → use `cmd /c "... < file"`.
- Edge-fn deploys MUST use `deploy-edge.ps1` (`--no-verify-jwt`) + garbage-bearer probe.
- Migrations via the Supabase Management API (`db push` unusable). Never wipe without showing the SQL + explicit owner approval.
- The **"Ma boutique"** item GetDraft flagged as out-of-scope is **this Linky project's shop-edit** — audited end-to-end, confirmed fully working.

---

# PART 2 — GETDRAFT (2026-06-20, shift 2)

*(Full report: `GetDraft_Daily_Report_2026-06-20.md`)*

## TL;DR
Shift-1 code fixes are **deployed and verified live in production.** This shift **proved it works**, applied the ranking migration, and started **moving the backend off Render's free tier onto Railway PRO** (no cold starts + likely fixes email). Email/phone delivery is **parked on the client** (code ready). Demo-ready with existing accounts.

## ✅ Verified in production
- All 4 tiers (`f25c1cc` → `7ab0d5b`) live: `GET /api/health → 200`.
- Security holds: `POST /auth/signup {role:"admin"} → 400` (escalation hole closed on the live build).
- **Migration 026 applied** to prod — `CREATE OR REPLACE VIEW athlete_ranking_scores`, dropping the duplicate `likes_received × 2`.
- Ranking shift verified: Liam Tremblay **167 → 85** → **Draft = 10** confirmed live.

## 🚧 Render → Railway PRO migration (in progress)
- **Why:** Render free tier cold-starts ~50s + **blocks outbound SMTP**; Railway PRO has no cold start + allows SMTP egress → likely fixes email *and* demo lag.
- `main.ts` already binds `0.0.0.0`/`PORT` (Railway-ready). Added `backend/railway.json`, committed `41fa0cf`.
- **Blockers:** GitHub repo (`ProgixDev/getdraft`) on another dev's account → use **Railway CLI deploy**. Railway PRO under `fadiprogix@gmail.com` → `railway login` as fadiprogix is the pending step. Env coverage checked (only legacy `STRIPE_PRICE_PREMIUM` missing — not needed).
- **Next:** `railway login` → `init` → `up` → env vars → `domain` → verify → repoint `eas.json` + Stripe/Didit webhooks → rebuild APK → decommission Render.

## ⏸️ Parked — client-gated (code ready)
- **Email OTP** — Resend HTTP transport (+ SMTP fallback) shipped `7ab0d5b`; turn on with `RESEND_API_KEY` + verified `MAIL_FROM`, or may "just work" via SMTP on Railway.
- **Phone OTP** — needs Twilio out of trial.

## 🎬 GetDraft demo readiness
- Demo with **existing accounts** (no live new-user signup). Warm the backend ~3 min before (N/A once on Railway).
- Flow: Discover + globe → Rankings (corrected) → Match→Game On!→DM → Profile → Admin ban/verify → Swipe limit + test-card upgrade.
- **4 client asks:** (1) email sending domain, (2) Twilio paid, (3) Stripe test-vs-live, (4) Apple Developer account for iOS.

---

## 🔑 Combined account / infra map

| Project | Concern | Account / location |
|---|---|---|
| Linky | App builds (EAS) | **expoborz** (`borzvalor@gmail.com`), project `linky`, keystore `tL2U4yoGKP` |
| Linky | DB / Auth / edge fns | Supabase `fvvqgcsphwrmdlclnxcz` (self-rolled auth) |
| Linky | Landing + APK host + email relay | Vercel `linky-gn.vercel.app` (SMTP relay live) |
| Linky | Admin | `adminlinky@gmail.com` (email + password) |
| GetDraft | Backend host | Railway PRO `fadiprogix@gmail.com` (migrating from Render) |
| GetDraft | GitHub repo | `ProgixDev/getdraft` (another dev) → CLI deploy |
| GetDraft | App builds (EAS) | `achrafbenamrane` owns project (account resolution pending) |
| GetDraft | Admin | `admin@getdraft.app` |

---

## ⏭️ Combined next steps
1. **Linky:** ship the `f7de0f13` APK to the landing when it finishes; confirm email inbox delivery; run the data wipe when ready.
2. **GetDraft:** finish the Railway deploy + verify (esp. email); repoint `eas.json`/webhooks; rebuild APK; decommission Render.
3. Both: collect client infra (email domain, SMS/Twilio, Apple Developer) to flip the last gated features on.

---

*Both projects verified against their live backends. Linky claims confirmed via pre-build verification workflow + live probes; GetDraft claims confirmed via the multi-agent audit cycle.*
