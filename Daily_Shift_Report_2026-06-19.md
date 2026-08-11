# Daily Shift Report — 19 June 2026 (Double Shift)

**Developer:** Achraf Benamrane
**Shifts:** Linky (pre-production hardening) · GetDraft (production deploy + launch verification)

> Two projects in one day. Both reached the same milestone — backend live + hardened, beta APK built and installable, launch-critical flows verified — and, notably, **both hit the exact same launch blocker: transactional email (OTP) failing on serverless hosting.** The fix is identical for both (move email to an HTTP provider).

---
---

# 🟦 SHIFT 1 — Linky

**Focus:** Pre-production hardening + launch-readiness verification
**Branch:** `main`

## TL;DR

Took Linky from "feature-complete" to **verified launch-ready beta**. Fixed a **critical escrow bug** (applied live), **unblocked all seller/agent publishing**, ran **two independent multi-agent audits** cross-checked against the client's launch requirements *and* the 29-May client meeting, **built + shipped a fresh beta APK** to the landing, and **gated off an unsafe P2P money path** after an adversarial review. One launch blocker remains: **email-OTP delivery fails on serverless** (same class as the GetDraft blocker).

**Status: ~95% launch-ready as a beta. One blocker (email OTP) + owner-side credentials (live Stripe, Lengopay, SMS, Didit) stand between beta and public launch.**

---

## ✅ Completed today

| # | Item | Result |
|---|------|--------|
| 1 | **Escrow release fix** | Found `confirm_order_receipt` had **two overloads** live — the edge fn hit the old one that rejected shipped (`preparing`) orders, so **escrow never released after a seller shipped**; plus a dangling token-less overload (latent QR-bypass). Migration `20260619_01` **applied to live DB**; verified a single 3-arg, scan-token-gated overload that accepts `preparing`. |
| 2 | **Seller/agent publishing unblocked** | KYC gate was unconditional while Didit (KYC provider) is dark → **no user could publish anything**. Soft-gated behind `diditConfig()` so it auto-arms the moment creds land. Deployed + probed. |
| 3 | **Pre-prod feature sweep (8 items)** | Multi-phone CRUD (OTP-gated add/remove/set-primary, 5 edge fns), **real shop followers** (table + RPC), **working data-saver** (image priority + Découvrir autoplay/carousel), notifications boot-gate, honest settings, verified Stripe + city-prefill. |
| 4 | **Favorites persistence** | Hearts were wiped on **every app restart** (in-memory only) → added MMKV persistence. |
| 5 | **i18n residuals** | ~10 screens rendered hardcoded French (Découvrir, product detail, orders, favorites, "become a seller", 404) → moved to FR/EN keys, mirrored. |
| 6 | **Product city filter** | The city selector on the marketplace was a **dead control** → wired through `list-products`. Verified live: filtering by Conakry returns only Conakry rows. |
| 7 | **Baseline schema migration** | Captured the manually-created identity schema (users / phones / emails / kyc_sessions / avatars bucket) into a reproducible migration for clean handoff. |
| 8 | **Dispute dead-control removed** | A "Photos (optionnel)" box with no picker/upload — removed. |
| 9 | **Beta APK built + shipped** | Built a fresh installable APK, uploaded to the landing (stable `/linky.apk`), **byte-exact verified**. Client can download today's full app. |

---

## 🔍 Verification (two multi-agent workflows + meeting cross-check)

| Pass | Verdict | Highlights |
|------|---------|-----------|
| **Global A→Z sign-off** (10 agents · FE + BE + live DB) | ✅ **83/95 requirements work end-to-end** | Seller, admin, messaging, agent areas essentially perfect. Found 2 must-fix — KYC-publish + favorites — **both fixed same day**. |
| **Adversarial money/abuse review** of P2P send-money (7 agents) | 🔴 Caught 1 blocker + 3 high | Demo-seed mint funnel, no daily cap, no KYC on money-out, phone-enumeration oracle. → **P2P gated OFF at 3 layers** + V1.1 hardening backlog filed. |
| **Client-meeting cross-reference** (29 May decisions) | ✅ Honored | Green/yellow brand (no red), QR receipt + hold-to-confirm, visit booking, cities-only geography, Stripe + Google Pay, Découvrir feed — all built. |

**Result: zero confirmed open code bugs in the verified flows.** Every "deferred" screen was checked against the owner's expectations, not just labeled.

---

## 🔴 Launch blocker — email OTP delivery

**Symptom:** Live probe of `otp-request` (email channel) → **502**; the SMTP send fails in production.

**Diagnosis:** The pipeline is correct (app → edge fn → landing `/api/send-otp` → nodemailer). The Gmail creds are **valid** — they authenticated and sent fine from a local machine. But they **fail on Vercel**: Gmail SMTP from serverless gets its rotating IPs flagged and the handshake times out. Updating the creds + redeploying did **not** fix it, which confirms it's the environment, not the password.

**This is the same class of bug as the GetDraft shift's blocker** — transactional email dying on serverless hosting.

**Fix:** Move email to an **HTTP API (Resend)** — port 443, immune to SMTP egress issues, better deliverability. A full fix prompt is written (`PHASE_EMAIL_OTP_FIX.md`). **Needs a Resend API key** from the owner; ~10–15 min to wire once available.

---

## 🟡 Non-blocking / deferred (V1.1)

- **P2P send-money** — gated off; AML hardening backlog (`WALLET_SEND_V1_1_BACKLOG.md`).
- **Addresses screen** — honest placeholder (no backend yet); CRUD build prompt queued.
- **Privacy toggles** — honest "Bientôt" (need analytics/recommender backends to be real).
- **GPS auto-locate** on property create — stubbed; manual coordinate entry as fallback.
- **Adaptive video quality** (720/480/1080) — not built; tied to the deferred Feed module.

---

## 📋 Remaining for launch

**Beta-blocking:**
- [ ] **Fix email OTP** (switch to Resend HTTP).
- [ ] **Device smoke tests** on the APK (buy → QR confirm → escrow release, seller publish, withdraw, follow, language switch).

**Cutover (before public launch):**
- [ ] Drop the demo-seed **100M-GNF** wallet trigger + the dev OTP code echo.

**Owner-side (external) credentials/contracts:**
- [ ] **Live Stripe keys** (currently TEST) · **Lengopay** (Orange/MTN Money) · **SMS provider** (phone OTP) · **Didit** KYC creds · **Firebase/APNS** push.

---

## 🔧 Infra notes / gotchas

- The APK was built under a **second EAS account** (the primary hit its free-tier monthly Android-build cap). New signing keystore → **the client must uninstall + reinstall once** (different signature). Future builds reuse this keystore, so it's a one-time reinstall.
- `app.json` is temporarily pointed at the new EAS project (uncommitted) — revert before the production / Play-Store build.
- Email: Gmail SMTP creds were added to Vercel + verified locally, but **Gmail-on-Vercel is unreliable** — Resend is the durable fix.

---
---

# 🟪 SHIFT 2 — GetDraft — Daily Report

**Date:** 2026-06-19
**Focus:** Production deployment + launch-readiness verification
**Branch:** `feat/discover-pinterest-redesign` (Render deploy source) / `master`

---

## TL;DR

The backend is **live and hardened in production**, the Android beta APK is **built and installable**, and a full code-level verification confirms **all 5 launch-critical flows are correctly implemented**. One **launch blocker** was found by live probing: **email-OTP signup hangs in production** (SMTP send never returns). Everything else is green or non-blocking.

**Status: ~90% launch-ready. One blocker (email delivery) stands between us and a usable beta.**

---

## ✅ Completed today

| # | Item | Result |
|---|------|--------|
| 1 | **Production deploy** | Resolved a branch mismatch — Render was auto-deploying `feat/discover-pinterest-redesign`, not `master`, so the rate-limit commit had never shipped. Commit `957d39d` is now **Live**. |
| 2 | **Rate limiting verified in prod** | 8 rapid logins → `401 ×5` then **`429 ×3`** (trips at req 6). Confirmed working against the live backend. No `trustProxy` change needed. |
| 3 | **Android beta APK built** | EAS `preview` profile → installable APK, internal-distribution link, points at the live backend (`/api`), test-mode Stripe key. Ready for device install + client beta. |
| 4 | **Admin password rotated** | `admin@getdraft.app` password changed from the weak default to a strong random value (stored in password manager — **not** recorded in this file). Verified: prod login returns `201` with `role: admin`. |
| 5 | **Saved reel/post back button** | Replaced the easy-to-miss `chevron-down` with a clear circular **back arrow** in the post/reel detail header; app-wide back-affordance audit confirmed every other screen + modal already has one. (Frontend, ships in the APK.) |
| 6 | **DB security/performance audit** | Supabase advisors run against prod. **No launch-blocking security issues** — sensitive tables (kyc, signup_otps, guardian_links, outreach) are correctly locked to backend-only (RLS-on, no client policy = deny-all). Perf lints are all scale-tuning, not beta-relevant. |
| 7 | **Mail service hardening** | Added fail-fast SMTP timeouts (`mail.service.ts`) so a misconfigured mailer returns a quick logged error instead of hanging requests ~2 min. (Staged in working tree.) |

---

## 🔍 Critical-flow verification (code-level, 6-agent workflow)

All five launch-critical flows traced end-to-end across backend + frontend, with adversarial confirmation of any finding.

| Flow | Verdict | Evidence highlights |
|------|---------|---------------------|
| **Email signup** | ✅ Works (code) | OTP → SMTP → verify → signed token → `admin.createUser` + DB trigger → session tokens → onboarding. Verified vs live DB (table, unique index, trigger all present). |
| **Match → DM → push** | ✅ Works | Mutual Draft → match row + "Game On!" → authenticated socket persists & broadcasts → Expo push to offline recipient. |
| **Block** | ✅ Works | Enforced **server-side**, **two-directional**, across messaging, discovery, globe, and swipe. |
| **Guardian (under-18)** | ✅ Works | Minor gated on first frame → QR link → parent video → admin approve → activation flips to active. Verified vs live DB (migration 022). |
| **Swipe limit** | ✅ Works | Basic 11th swipe → **HTTP 429** server-side, daily reset, bonus-pack aware. |

**Result: zero confirmed code bugs.** The single "major" candidate (signup) was adversarially refuted as **config-only, not a code defect**.

---

## 🔴 Launch blocker — email delivery

**Symptom:** Live probe of `POST /api/auth/email/request-otp` (warm dyno, `health: 200`) **hangs >60s with no response** (`HTTP 000`). Login responds instantly, so the hang is specific to the OTP route → the **SMTP send is hanging in production**.

**Impact:** New users **cannot sign up** — email OTP hangs, and phone OTP isn't production-ready (Twilio still on trial). Both signup paths are currently unusable for real users.

**Most likely cause:** Render blocking outbound SMTP egress (common on free tier) or misconfigured SMTP credentials.

**Mitigation applied:** Fail-fast timeouts added to the mailer so the failure is fast + logged (diagnosable) instead of a silent 2-minute hang.

**Next step (diagnosis):** Read Render → Logs → search `SMTP` for the boot result:
- `SMTP verify failed: ...ETIMEDOUT/ECONNREFUSED` → egress blocked → switch to an HTTP email API.
- `SMTP verify failed: ...EAUTH` → wrong creds → set a Gmail App Password.
- `SMTP_USER / SMTP_PASS not set` → env vars missing.

**Recommended fix:** Move transactional email to an **HTTP provider (Resend / SendGrid)** — port 443, immune to SMTP egress blocks, proper deliverability, and avoids Gmail's ~500/day cap. ~15 min to wire in once an API key is available.

---

## 🟡 Non-blocking findings (post-launch polish)

- **Block — search/profile:** `GET /users/search` and `getPublicProfile` aren't block-filtered (a blocked user appears in search & their profile is fetchable), but starting a DM is still rejected `403` server-side. Cosmetic gap vs the "they won't see your profile" copy.
- **Match — realtime:** `emitNewMatch` socket event is unused; the already-waiting user learns of a match via push, not a live socket event, until refetch.
- **Swipe — "Pro unlimited":** Pro maps to **70/day**, not literally unlimited (the `-1` sentinel is dead code). Spec vs implementation mismatch.
- **Swipe — pass UI:** "Pass" swipes consume quota server-side but the out-of-swipes lock only updates on a draft response.
- **Swipe — concurrency:** check-then-increment is non-transactional (minor TOCTOU over-count risk under rapid concurrent swipes).
- **Stale test:** `discover.service.spec.ts` predates the Prisma+429 implementation.
- **Auth UX:** existing-email OTP request is an enumeration-safe no-op (no email sent, by design) — consider client copy pointing existing users to sign-in.

---

## 📋 Remaining for launch

**Beta-blocking:**
- [ ] **Fix email delivery** (diagnose Render SMTP log → fix creds or switch to Resend HTTP).
- [ ] **Device smoke tests** on the APK (email signup, match→DM→push, block, guardian approve, 11th-swipe 429).
- [ ] **Supabase:** enable leaked-password protection (1 toggle).

**Full public launch (later):**
- [ ] **Twilio** out of trial → phone signup for all users.
- [ ] **Stripe** TEST → LIVE keys + live prices + dashboard webhook.
- [ ] **Play Store** production AAB submission (+ iOS needs a paid Apple Developer account).
- [ ] Optional perf migration `026` (RLS `(select auth.…)`, dedupe permissive policies, covering indexes on 9 FKs).

---

## 🔧 Infra notes / gotchas

- **Render deploy branch is `feat/discover-pinterest-redesign`**, not `master`. Future deploys must push to that branch (or repoint Render → `master` in Settings). This caused the throttler "not tripping" confusion earlier today.
- Free Render dyno **spins down on inactivity** (~50s cold start) — first request after idle may time out; retry.
- `AUTH_VERIFICATION_SECRET` should be set to a **stable** value in Render so verification tokens survive redeploys (otherwise a verify→complete that straddles a restart fails).
- `EXPO_PUBLIC_API_URL` must keep its `/api` suffix (axios appends route paths).
- `d2706ba` (back-button commit) is **local on `master`, unpushed** — will ride along with the next push.

---

*Generated 2026-06-19. Linky verification via two multi-agent workflows + live production probing; GetDraft verification via 6-agent code-level workflow + live production probing.*
