# GetDraft — Daily Report

**Date:** 2026-06-20 (shift 2 — verification, infra migration & demo prep)
**Focus:** Prod verification, migration 026, Render→Railway migration, launch-config decisions, client-demo prep
**Companion:** see `DAILY_REPORT_2026-06-19.md` (shift 1 — audit + all code fixes T1–T4)

---

## TL;DR

Shift 1's code fixes are **deployed and verified live in production.** This shift focused on **proving it works**, applying the ranking migration, and **moving the backend off Render's free tier onto Railway PRO** (no cold starts + likely fixes email). Email/phone delivery is **parked on the client** (code is ready). The app is demo-ready with existing accounts.

**Status: ✅ Verified in prod. 🚧 Railway migration in progress. ⏸️ Email/phone gated on client.**

---

## ✅ Verified in production today

- **Deploy live** — all 4 tiers (`f25c1cc` → `7ab0d5b`) running: `GET /api/health → 200`.
- **Security holds** — `POST /auth/signup {role:"admin"} → 400` (admin-escalation hole confirmed closed on the live build).
- **Migration 026 applied** to the prod DB (via `prisma db execute`, sourcing `backend/.env`) — `CREATE OR REPLACE VIEW athlete_ranking_scores`, dropping the duplicate `likes_received × 2` term.
- **Ranking shift verified** — Liam Tremblay **167 → 85**, leaderboard re-ranked → **Draft = 10** confirmed live.

---

## 🚧 Render → Railway migration (in progress)

**Why:** Render's free tier cold-starts ~50s (bad for a live demo) and **blocks outbound SMTP** (the email blocker). Railway **PRO** has no cold starts and generally **allows SMTP egress** — so this likely fixes email *and* the demo lag.

**Code readiness:** `main.ts` already binds `0.0.0.0` on `process.env.PORT` — Railway-compatible, no server change. Added `backend/railway.json` (build `npm install --include=dev && npm run build`, start `npm run start:prod`, healthcheck `/api/health`), committed + pushed (`41fa0cf`).

**Status / blockers worked through:**
- **GitHub deploy blocked** — the repo (`ProgixDev/getdraft`) is on another team member's GitHub account, not connectable from the Railway workspace → pivoted to **Railway CLI deploy** (uploads local code directly, no GitHub needed).
- **Account** — Railway PRO is under `fadiprogix@gmail.com` (not achraf/univ-annaba). CLI was logged into the wrong account; logged out, **`railway login` as fadiprogix is the pending step.**
- **Env coverage checked** — `backend/.env` vs `render.yaml`: only `STRIPE_PRICE_PREMIUM` missing (Premium is a legacy/inactive plan alias — not needed). `PORT` extra (Railway injects it).

**Next:** `railway login` (fadiprogix) → `railway init` → `railway up` (from `backend/`) → set env vars in dashboard → `railway domain` → verify (health/security/email/rankings) → repoint `eas.json` + Stripe/Didit webhooks → rebuild APK → decommission Render.

---

## ⏸️ Parked — client-gated (code ready)

- **Email OTP** — Resend HTTP transport (+ SMTP fallback, fail-fast timeouts) shipped in `7ab0d5b`, dormant until configured. Turn on with `RESEND_API_KEY` + verified `MAIL_FROM` when the client provides their email domain — **or** it may "just work" via SMTP once on Railway (to be tested).
- **Phone OTP** — needs Twilio out of trial.

> Implication: new-user signup can't be exercised in prod until one of these is live. Everything else is testable with existing accounts (password login works).

---

## 🔑 Account / infra map (for the team)

| Concern | Account | Notes |
|---|---|---|
| **Backend host** | Railway PRO — `fadiprogix@gmail.com` | migrating here; consider moving to a shared Railway team later |
| **GitHub repo** | `ProgixDev/getdraft` (another dev) | not connectable to Railway → CLI deploy used |
| **EAS / app builds** | `achrafbenamrane` owns the project; CLI was on `expoborz` | **APK build pending account resolution** (build as achrafbenamrane, or re-own project under expoborz) |
| **DB / Auth** | Supabase (live) | unchanged; reached via env vars from any host |
| **Admin login** | `admin@getdraft.app` | password rotated (stored privately) |

---

## 🎬 Client demo readiness

- **Demo with existing accounts** (login works) — do NOT attempt new-user signup live (email/phone gated).
- **Warm the backend ~3 min before** (cold start on Render; N/A once on Railway).
- **Demo flow:** Discover + globe → Rankings (corrected) → Match→Game On!→DM → Profile (saved + back button + clearable fields) → Admin ban/verify → Swipe limit + test-card upgrade.
- **A fallback APK** (latest fixes, Render-pointing) was building as a safety net in case Railway isn't green by meeting time.
- **4 asks to bring to the client:** (1) email sending domain, (2) Twilio paid, (3) Stripe test-vs-live decision, (4) Apple Developer account for iOS.

---

## What's next

1. Finish the Railway deploy (`railway login` → init → up → env vars → domain) + verify (esp. **email**).
2. Repoint `eas.json` + Stripe/Didit webhooks to Railway; rebuild the APK (resolve the EAS account first).
3. Decommission Render once Railway is green.
4. Client provides email/phone infra → flip both on (config only).

---

## Gotchas logged today

- `npx prisma` pulls Prisma 7 (flags changed) → use the backend's local `node_modules/.bin/prisma` (6.x) + source `backend/.env` for `db execute`.
- Render deploys `master`; Railway (CLI) redeploys manually via `railway up` (no GitHub auto-deploy until access is granted).
- `eas.json` `EXPO_PUBLIC_API_URL` must keep its `/api` suffix; update both `preview` and `production` profiles when the Railway URL is ready.
- The "Ma boutique" UI item raised today belongs to the **linky** project, not GetDraft — out of scope here.

---

*Continuation of the multi-agent audit cycle; all prod claims verified against the live backend.*
