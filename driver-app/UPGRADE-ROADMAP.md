# Skeleton Upgrade Roadmap — "Next Level" (v2, research-backed)

> **Purpose.** Single source of truth for taking the Expo + Next.js skeletons to a production,
> secure, store-ready, professionally-designed level. Built so both you and the AI agents can
> reopen it and know exactly where we are and what's next.
>
> **How to use.** Work top-to-bottom. Expo first, then Next.js. Each item has a status box — check
> it when done. Agents: before writing code for a phase, read its linked brief in
> [`docs/research/`](docs/research/README.md) so you copy the _verified current_ pattern, not a guess.

**Status legend:** `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked

---

## 0. Decisions locked

| Decision               | Choice                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| CI/CD + Notion         | **Remove cloud ceremony** (GitHub Actions, Notion, Slack). **Keep local gates** (`verify` + pre-commit hooks; consider Lefthook).    |
| Shared UI              | **Lean curated core + `/new-component` generator.** No giant pre-built library.                                                      |
| Supabase (Expo)        | **Full secure reference** — auth, DB, RLS, secure storage, one end-to-end example feature.                                           |
| App categories         | Accounts/auth · **Payments/subscriptions** · **Sensitive personal data** · Consumer/content → **max security + max store scrutiny**. |
| **Payments**           | **RevenueCat** (free ≤ $2,500 MTR, then 1%). Escape hatch: `expo-iap`.                                                               |
| **Entitlement store**  | **Supabase Edge Function → table → RLS** (webhook verifies header secret; client read-only).                                         |
| **Analytics**          | **PostHog** (Expo-Go friendly, ATT-free, self-host/EU).                                                                              |
| **Crash/error**        | **Sentry** `@sentry/react-native` (ATT-free, auto EAS source maps).                                                                  |
| **Push notifications** | In scope, later pass (after security + store + design).                                                                              |
| Order                  | **Expo first**, then mirror into Next.js.                                                                                            |

> The stack choices avoid the ATT prompt entirely (PostHog + Sentry are ATT-free) — one less rejection surface. Evidence: [`06-payments-analytics-stack.md`](docs/research/06-payments-analytics-stack.md).

---

## Sequencing (Expo)

```
Phase 0  Cleanup            → strip cloud CI/CD + Notion/Slack, keep local gates
Phase 1  Security base      → enforced security layer everything builds on
Phase 2  Supabase secure    → auth + RLS + LargeSecureStore + example feature + payments→DB
Phase 3  Store compliance   → Apple+Google rule base + /store-readiness audit skill
Phase 4  Design prompts     → professional brief + token contract + ui-ux-pro-max
Phase 5  Docs for AI        → machine-legible, path-scoped, queryable rule files
Phase 6  Skills             → /daily-report, /security-review, /store-readiness, /new-component
Phase 7  Shared UI core     → lean tokenized primitives + generator
```

Then **Phase N** mirrors this into Next.js.

---

## Phase 0 — Cleanup (Expo ✅ done on branch `chore/skeleton-upgrade`; Next.js pending)

- [x] Delete `.github/workflows/*` cloud automation (8 workflows) + orphaned ship-report PDF css.
- [x] Remove Notion server from `.mcp.json` (kept Argent); delete `docs/process/notion-workspace.md`; fix dangling refs across docs/skills.
- [x] Keep & verify local gates: `docs:lint` + `format:check` green; Husky pre-commit intact. (`lint`/`test` not runnable in the Linux sandbox — native bindings installed for macOS; run on the Mac.)
- [x] Rewrite `docs/process/workflow.md` to a **repo-only** model; record as **ADR-0008**; mark ADR-0006 partially superseded; update AGENTS.md + docs/index.md.
- [~] Prune orchestration-only skills — **deferred to Phase 6** (progix/meeting-intake/feature-report de-Notioned during the skill rebuild).
- [ ] Next.js: apply the same Phase 0 cleanup.

## Phase 1 — Security foundation (Expo) → read [`01-mobile-security.md`](docs/research/01-mobile-security.md)

**Principle: the client is hostile; the real boundary is the server.** Everything here is enforced (lint rule / hook / test), not advice.

- [x] `docs/security/threat-model.md` + `docs/security/checklist.md` (queryable `SEC-*` rule file: id | severity | rule | verify | enforced-by) and a **MASVS coverage matrix** in `SECURITY.md`.
- [x] **Storage tiers** `src/shared/lib/storage/`: `secureStorage` (expo-secure-store), `LargeSecureStore` (AES + Keychain, >2KB), `appStorage` (non-sensitive). **ESLint-bans** direct AsyncStorage/expo-secure-store/mmkv imports outside the folder; tasks store refactored through it. _(MMKV fast-tier deferred — needs a dev build; AsyncStorage covers non-secret state for now.)_
- [x] SecureStore defaults: `WHEN_UNLOCKED` + `deviceOnly` option; `remove()` on logout; `LargeSecureStore` for the Supabase session. _(Android backup exclusion + `usesNonExemptEncryption` = Phase 2 config wiring.)_
- [x] **Secret guard** `scripts/check-secrets.mjs` (in `verify` + pre-commit): rejects `EXPO_PUBLIC_*` secret-looking names + hardcoded `sk_/sb_secret_/service_role/JWT` literals in source AND the built `dist/` bundle. _(BFF/proxy template = Phase 2.)_
- [x] **Deep-link allowlist gate**: `src/shared/lib/deep-link.ts` (host+route allowlist, parse-in-try/catch, safe fallback, no open redirect) + `src/app/+native-intent.tsx` + tests.
- [x] **Redacting logger** `src/shared/lib/logger.ts` (tokens/PII/JWTs scrubbed) — supports "never log secrets".
- [x] **Local gates**: gitleaks wired into pre-commit (`.gitleaks.toml`, optional binary) + `secrets:check` in `verify`. _(ESLint security plugins / Semgrep pre-push deferred — `no-restricted-imports` + check-secrets cover the critical cases.)_
- [ ] Transport: ATS on / Android cleartext off via config plugin; enforce TLS.
- [ ] OAuth safety: system browser, ban embedded WebView, verified-link auth callback (Phase 2 with Supabase).
- [ ] Supply chain: `--frozen-lockfile` + `minimumReleaseAge` + Socket.dev (backlog).
- [ ] `expo-screen-capture` on PII/payment screens (backlog).
- [ ] **Strongly recommended (dev build):** `@expo/app-integrity` attestation; freeRASP; MobSF + `hermes-dec` at release; biometric vault tier.
- [ ] **Nice-to-have:** SPKI cert pinning (toggleable, OTA); pre-Hermes obfuscation.
- **⚠️ On your Mac:** run `npx expo install expo-secure-store react-native-get-random-values && npm i aes-js && npm i -D @types/aes-js` (pins added to package.json — reconcile with `npx expo install --fix`), then `npm run verify` to confirm lint/typecheck/test pass (the Linux sandbox can't run them).

## Phase 2 — Supabase secure reference (Expo) → read [`03-supabase-security.md`](docs/research/03-supabase-security.md)

- [x] ADR `0007-supabase-backend.md` (RLS-first posture, data boundary).
- [x] `src/shared/lib/supabase.ts` — client with **LargeSecureStore** session, `flowType:'pkce'`, `detectSessionInUrl:false`, `autoRefreshToken`, `persistSession`, `lock:processLock`; `registerSupabaseAutoRefresh()` AppState wiring. Env adds `SUPABASE_URL` + `ANON_KEY` (env.ts **rejects a service_role key**).
- [x] Auth slice `src/features/auth/` — sign up/in/out/session store, Zod-validated, error/loading states, testIDs; `useProtectedRoute` guard wired in `_layout`; `sign-in` route. _(Polished UI + verified-link PKCE deep-link callback = Phase 4/later.)_
- [x] **RLS reference migrations** (`supabase/migrations/`): revoke default grants + **auto-enable RLS event trigger** + `private` schema (`0001`); `profiles` mirror (`0002`); owner-scoped CRUD example `notes` (`0003`, the canonical pattern); entitlement table (`0004`). MFA-`aal2` restrictive policy documented in `backend.md`.
- [x] Canonical **example feature persisted behind RLS** = `notes` (replaces the painted-door pattern).
- [x] **pgTAP RLS tests** (`supabase/tests/database/rls.test.sql`) + **Security Advisor** gate documented (`supabase db lint`, block ERROR 0007/0013/0015).
- [x] **Payments→DB**: RevenueCat webhook Edge Function (`verify_jwt=false`, verify Authorization-header secret, idempotent upsert) → `subscriptions` (client RLS SELECT-only; only service_role writes).
- [x] **Secret-in-bundle guard** extended: env.ts refuses a service*role/`sb_secret*`anon key;`check-secrets`scans source +`dist/`.
- [x] `docs/architecture/backend.md` (client, auth, RLS rules, copy-paste table pattern, payments, verification gates).
- [ ] **Follow-ups (next security pass):** swap the demo `tasks` store onto `notes`+Supabase in the UI; asymmetric JWT signing keys; MFA enrolment UI; leaked-password protection + CAPTCHA; storage-bucket policies; sign-out affordance in UI.
- **⚠️ On your Mac:** `npx expo install @supabase/supabase-js react-native-url-polyfill expo-secure-store react-native-get-random-values && npm i aes-js && npm i -D @types/aes-js`; then `npx expo start` once (regenerates typed routes for `/sign-in`) and `npm run verify`. Supabase: `supabase db reset && supabase test db`.

## Phase 3 — Store compliance (Apple + Google) → read [`02-store-compliance.md`](docs/research/02-store-compliance.md)

- [x] `docs/store/apple-app-review.md` + `docs/store/google-play.md` — AI-legible, rule-id → requirement → how-we-comply (exact guideline numbers incl. **2.5.2** from the vibe-coding crackdown).
- [x] `docs/store/checklist.md` — queryable `STORE-*` rule catalog (auto vs manual) for the audit skill.
- [x] `docs/store/submission-runbook.md` — brand → pre-flight → privacy → accounts/payments → metadata → build/submit → external audit.
- [x] **Highest-leverage defenses baked in:**
  - [x] Mandatory **in-app account deletion**: `/account` route + `delete-account` Edge Function (validates JWT, admin-deletes user + cascaded data) + `deleteAccount` store action. _(Web deletion URL = per-project, in runbook.)_
  - [x] **iOS privacy manifest** (`ios.privacyManifests` with required-reason codes) + `usesNonExemptEncryption:false` in `app.config.ts`. _(SDK-reading generator = future nicety; runbook covers copying SDK reasons.)_
  - [~] **IAP/payments**: RevenueCat + server-owned entitlement done in Phase 2; paywall UI + Restore button land with the design phase.
  - [x] ATT intentionally omitted (stack is ATT-free).
  - [x] `expo-build-properties` target API **35**; `android.blockedPermissions` template; tailored `infoPlist` usage-string guidance.
- [x] **"No soon" / store-readiness audit** `scripts/check-store-readiness.mjs` (`npm run store:check`, pre-submission gate not in `verify`): placeholder copy, template identity (`com.yourcompany`/slug/scheme), deletion path, privacy manifest, target SDK.
- [x] **Originality gate** documented (4.3): the audit flags template-identity leftovers; the manual checklist + `/store-readiness` skill require a stated differentiator per app.
- [ ] `/store-readiness` skill (Phase 6) wraps the audit + manual catalog, citing rule IDs.
- **⚠️ On your Mac:** `npx expo install expo-build-properties`; run `npm run store:check` before any submission (it will flag the skeleton's own placeholder identity — that's the "brand before shipping" signal).

## Phase 4 — Claude Design prompts (professional) → read [`04-design-and-prompting.md`](docs/research/04-design-and-prompting.md)

- [x] Rebuilt `docs/templates/claude-design-prompt.md` into the **professional brief**: ROLE persona, product surface with **realistic data**, named/cultural reference anchors, **design-token contract**, all required states (empty/loading/error/onboarding/permission/paywall/account-deletion), motion+haptics, a11y, multi-pass + 3-directions + self-critique, and an explicit **DO-NOT list** (no Inter/Roboto, no purple-on-white gradients, no Tailwind defaults, no lorem, no shadow soup).
- [x] `docs/design/quality-bar.md` — premium vs vibe-coded checklist + reject-worthy tells + a per-app **Rebrand checklist**. Flags that the skeleton's own `#6366F1`/Inter defaults ARE the amateur tell.
- [x] Rewrote the `design-prompt` skill: de-Notioned, reads the quality bar + token contract, sources product context (PRD or AskUserQuestion), runs **`ui-ux-pro-max` if installed** (`--design-system`) else proposes a distinctive palette/font, fills the brief, self-critiques.
- [x] Aligned `docs/conventions/design-system.md` (token-contract framing, dark-mode rule, "rebrand the placeholder indigo" callout) + fixed the painted-door "coming soon" conflict with store rule 2.1.
- [~] **`ui-ux-pro-max` referenced as an optional install** (its CSV+Python DB isn't vendored — kept lean per the "don't over-build" research). The skill calls it when present.
- **⚠️ Per app:** run `/design-prompt`, then rebrand (palette + font + identity) before building UI — default indigo/Inter is the #1 AI tell.

## Phase 5 — Docs for AI legibility → read [`05-agent-skill-architecture.md`](docs/research/05-agent-skill-architecture.md)

- [x] **Front-matter** (`id`/`read-when`/`owns`) on all new docs (security, store, design, research, backend) + the core architecture docs; AGENTS notes the convention + just-in-time retrieval.
- [x] `docs/index.md` = a **pointer table** ("read X when Y"), with sections for Security / Store / Design / Research.
- [x] **Queryable rule files**: `docs/security/checklist.md` (`SEC-*`) + `docs/store/checklist.md` (`STORE-*`) loaded on demand; the audit skills cite the IDs.
- [x] Kept AGENTS.md short; `@AGENTS.md` import stays; one fact = one home (repo-only, ADR-0008).
- [~] **Path-scoped `paths:` skills** — deferred (the `read-when` front-matter + grep/glop retrieval cover it; revisit if context bloat shows up). Legacy-doc front-matter sweep is optional backlog.

## Phase 6 — Skills → read [`05-agent-skill-architecture.md`](docs/research/05-agent-skill-architecture.md)

- [x] **`/daily-report`** — git-context injection → writes `docs/reports/daily/<date>.md` **in French, classed by project** (Travail effectué / Ce qui est en cours / Les blocages / Message pour le client + hand-filled hours & front/back %). Returns path + summary.
- [x] **`/security-review`** — audits the diff vs `docs/security/checklist.md` (`SEC-*`), explicit RLS/secret/validation checks, `[P1|P2|P3] SEC-ID` findings + APPROVE/REQUEST-CHANGES verdict + harness proposals.
- [x] **`/store-readiness`** — runs `store:check` + walks the manual `STORE-*` catalog (demo account, IAP/Restore, labels, 4.3 differentiator) → READY/BLOCKED.
- [x] **`/new-component`** — generator for a tokenized, accessible, dark-mode, testID'd shared UI primitive + test; lean-core ("don't pre-build the unused").
- [x] Hooks already present and kept: PreToolUse `protect-paths`, PostToolUse `post-edit-format`; permissions allow/deny in `.claude/settings.json`.
- [~] Ship as a versioned plugin (`expo-harness`) + delete dead Notion skills (progix/meeting-intake/setup-project) — flagged "legacy" in the skills README; **optional backlog**.

## Phase 7 — Shared UI lean core + generator → read [`04-design-and-prompting.md`](docs/research/04-design-and-prompting.md)

- [x] Curated core kept (Button, AppText, Screen, TextField) + added near-universal **Card, EmptyState, Skeleton** (token-only, accessible, light/dark, testID, tests). Dependency-free + Expo-Go-friendly (no Lucide/sheet libs forced — apps choose their icon set).
- [x] Each primitive: design-token-driven (no hardcoded hex), accessible (Skeleton has reduced-motion + progressbar role; EmptyState slots), light/dark via role tokens, testID, unit test.
- [x] `tailwind.config.js` is the **token contract** `/new-component` obeys; `design-system.md` documents the lean-kit + generate-on-demand policy.
- [x] `/new-component` (Phase 6) generates the rest **on demand** — never pre-build the unused.
- [~] **Optional later:** Icon (Lucide + react-native-svg), Sheet/Modal (needs a lib decision) — generate when a feature needs them.
- **⚠️ On your Mac:** `npm run verify` to confirm the new primitives lint/typecheck/test (the Skeleton uses Reanimated — verify on device that the pulse + reduced-motion behave).

---

## Phase N — Next.js mirror (after Expo)

Same spine, web-adapted (read the same briefs):

- [x] **Phase 0 cleanup** (done on `chore/skeleton-upgrade` in NEXTJS-SKELETON): removed 5 cloud workflows + Notion rule/doc/templates + daily-reporter agent; repo-only **ADR-0006**; fixed dead links; gates (`check:docs`/`check:typography`) green.
- [x] **Phase 1 web security**: security headers in `next.config.ts` (HSTS/X-Frame/nosniff/Referrer/Permissions + report-only CSP, `poweredByHeader:false`); `scripts/check-secrets.mjs` (NEXT*PUBLIC*_ guard + bundle scan) in `verify` + pre-commit; `.gitleaks.toml`; `src/lib/redirect.ts` open-redirect gate + test; redacting `src/lib/logger.ts`; `SECURITY.md` coverage matrix + `docs/security/{threat-model,checklist}.md` (`SEC-_`).
- [x] **Supabase SSR**: `@supabase/ssr` browser+server+middleware clients, cookie session refresh + protected-route guard (`src/middleware.ts`), the same RLS-first migrations (0001-0004) + pgTAP, auth slice (sign-in form + server actions), **account deletion** (admin service-role), ADR-0007 + `backend.md`. _(Asymmetric JWT = adopt per project.)_
- [x] **Web production readiness**: `robots.ts`, `sitemap.ts`, `manifest.ts`, `not-found.tsx`, `global-error.tsx`, full metadata + OG/Twitter + canonical + JSON-LD, `src/core/site.ts`, **`scripts/check-web-readiness.mjs` (`pnpm web:check`)** + `docs/web/checklist.md` (`WEB-*`). _(PostHog + Sentry + Core Web Vitals documented as the recommended wiring.)_
- [x] **Design prompts**: rebuilt professional brief (web screen inventory: 404/500/empty/loading/auth/pricing) + `docs/design/quality-bar.md` (flags the default shadcn theme as the tell) + rewritten `/design-prompt` skill.
- [x] **Skills**: French `/daily-report` (by project + client message), `/security-review` (`SEC-*`), `/new-component` (shadcn), `/web-readiness`. _(Plugin packaging = optional backlog.)_
- [x] **Shared UI**: shadcn/ui core + added `Skeleton` + `EmptyState` (token-only, accessible, tested) + `/new-component` generator.
- **⚠️ On your Mac:** `pnpm install` (adds @supabase/ssr + supabase-js), set `NEXT_PUBLIC_SUPABASE_*` in `.env.local`, then `pnpm verify`; `supabase db reset && supabase test db`. Run `pnpm web:check` before launch.

**Both skeletons upgraded.** Each lives on its own `chore/skeleton-upgrade` branch (main untouched), ready to review + merge.

---

## Cross-cutting principles

- Every move is **calculated**: a rule, a test, or a doc backs it — never "code and done".
- **Deny by default** (RLS, validation, permissions, deep links).
- **The server is the boundary** — client controls are defense-in-depth.
- **No placeholders in shippable screens** ("no soon"); **innovation gate** — differentiate, don't thin-clone.
- **Token contract** governs all UI; forbid the AI defaults.
- Repo is the only home of truth; docs are AI-legible and path-scoped.

## Open questions / parking lot

- Push notifications — provider + when (expo-notifications; later pass).
- Cert pinning / RASP / attestation — opt-in per app or default-on for the skeleton? (lean: default-on for the secure example, documented toggle).
- Lefthook vs keep Husky — decide in Phase 1.
- Per-app differentiation: how strict should the originality gate be before it blocks a build?
