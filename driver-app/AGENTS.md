# AGENTS.md — Operating Manual

This file is the entry point for every coding agent (and every human) working
in this repository. It tells you how we work, where knowledge lives, and which
rules are non-negotiable. `CLAUDE.md` imports this file; Cursor/Copilot rules
point here too. **When instructions conflict, the user's explicit prompt wins,
then this file, then linked docs.**

## What this repository is

A production skeleton for our mobile apps. Expo SDK 56 · React Native 0.85 ·
React 19.2 · TypeScript strict · expo-router · Zustand 5 · Zod 4 ·
NativeWind 4 (Tailwind 3) · Reanimated 4 · Jest + React Native Testing
Library · Maestro + Argent for E2E/agentic QA.

Expo has changed significantly: read the versioned docs at
https://docs.expo.dev/versions/v56.0.0/ before writing Expo-specific code.
Notably, `expo-router` no longer sits on react-navigation — never import
`@react-navigation/*`.

## Operating model — every task follows this loop

1. **Ground yourself.** Read the relevant docs from the map below _before_
   writing code. For product work, the PRD in `docs/product/prds/` is the
   contract. Look at neighboring code: the repo is deliberately homogeneous —
   pattern-match `src/features/tasks/` rather than inventing new shapes.
2. **Size, then plan.** Triage first (ADR-0005): **S** (bug fix / tweak) →
   no planning artifacts, implement directly with a regression test. **M**
   (one slice) → testable PRD + a task list with file paths and AC mapping.
   **L** (multi-slice / native changes) → exec plan in
   `docs/architecture/exec-plans/` (≤2 pages, copy `_template.md`), kept
   updated as the durable log. Run `/clarify` first when a PRD has
   ambiguities that would change the implementation (max 5 questions).
   Always inventory existing code before planning — reuse, never recreate.
3. **Implement.** Small commits, Conventional Commit messages
   (`feat(tasks): …`). Follow the hard rules below — they are enforced by
   ESLint, Jest, docs-lint and the local gates, so violations fail `verify` anyway.
4. **Verify — close the loop.** `npm run verify` must pass. For UI changes,
   boot the app and _look at it_: with the Argent MCP you can build, launch,
   tap, screenshot and read logs on the iOS Simulator / Android emulator
   yourself. A change is not done until you have observed the new behavior
   end to end (run the relevant CUJ in
   `docs/quality/critical-user-journeys.md`).
5. **Encode the feedback.** If you (or a reviewer) hit a mistake that could
   recur, make it impossible: add a lint rule, a test, or update the docs in
   the same PR. Update any doc your change made stale — `npm run docs:lint`
   fails on broken links and orphaned docs.

## Commands

```bash
npm run verify        # format + lint + animations + typecheck + test + docs:lint + functions + secrets — the local gate
npm test              # Jest (watch: npm run test:watch)
npm run lint:fix      # ESLint with autofix
npm run typecheck     # tsc --noEmit
npm run ios           # expo start --ios (dev client)
npm run e2e:ios       # Maestro flows in .maestro/flows
npm run new:feature   # scaffold a feature slice (then read the printed next steps)
npm run docs:lint     # docs integrity: links, orphans, taste rules, CUJ↔Maestro sync
npm run animations:check  # Reanimated entering/exiting must respect useReducedMotion
npm run functions:check   # every supabase/functions/<name> declares verify_jwt in config.toml
```

## Docs map — decide what to pull into context

| Read this                                       | When                                                  |
| ----------------------------------------------- | ----------------------------------------------------- |
| `docs/index.md`                                 | You want the table of contents of all knowledge       |
| `docs/architecture/overview.md`                 | First task in this repo                               |
| `docs/architecture/module-boundaries.md`        | Adding files/imports anywhere                         |
| `docs/architecture/state-management.md`         | Touching Zustand stores or async data                 |
| `docs/architecture/navigation.md`               | Adding screens or deep links                          |
| `docs/architecture/styling.md`                  | Any UI work (NativeWind patterns)                     |
| `docs/architecture/decisions/`                  | Why things are the way they are (ADRs)                |
| `docs/architecture/exec-plans/`                 | Implementation plans (write yours here)               |
| `docs/conventions/code-style.md`                | Writing any TypeScript                                |
| `docs/conventions/testing.md`                   | Writing or fixing tests                               |
| `docs/conventions/git-workflow.md`              | Branching, commits, PRs, releases                     |
| `docs/conventions/design-system.md`             | Tokens, typography, components                        |
| `docs/conventions/environments.md`              | Env vars, EAS profiles, secrets                       |
| `docs/product/vision.md` + `docs/product/prds/` | What we're building and why                           |
| `docs/personas/`                                | Reviewer lenses the `/review` skill applies           |
| `docs/quality/critical-user-journeys.md`        | What must never break (QA flows)                      |
| `docs/quality/quality-score.md`                 | Current code-health notes — append yours              |
| `docs/runbooks/`                                | Setup, release, agentic QA operations                 |
| `docs/process/`                                 | How the team works: the two tracks, DoD, R2R          |
| `docs/templates/`                               | Human-facing artifacts skills instantiate             |
| `docs/reports/`                                 | Feature + daily evidence reports (Markdown)           |
| `docs/research/`                                | Cited 2025–2026 research grounding the upgrade        |
| `docs/security/`                                | Auth, storage, secrets, deep links, network, payments |
| `docs/store/`                                   | App Store / Play compliance + submission runbook      |
| `docs/design/`                                  | The quality bar (premium vs vibe-coded) for any UI    |
| `specs/constitution.md` + `specs/`              | Non-negotiable principles + spec-track contracts      |

Docs carry `read-when` / `owns` front-matter so you can tell if a file is relevant before reading it
(security, store, design, research, and core architecture docs already do). Prefer just-in-time
retrieval (grep/glob + the `read-when` line) over loading everything up front.

## Operating model — repo-only (ADR-0008, partially supersedes ADR-0006)

**The repo is the only operating surface.** There is no Notion/Slack/GitHub-Actions
layer to keep in sync, and no cloud CI — verification runs locally via `npm run verify`
and the Husky pre-commit hooks. Every fact has one home, and that home is the repo
(Constitution Art. XI). Feature-track work lives in `specs/NNN-slug/` under
`specs/constitution.md`; the S/M/L sizing gate lets small work skip the ceremony.
Full skill flow and roles: `docs/process/workflow.md`. The upgrade in progress
(security, store-compliance, Supabase, design, skills) is tracked in
`UPGRADE-ROADMAP.md` and grounded in the cited briefs under `docs/research/`.

> Note: the old `/progix` "four-surface" front door (ADR-0006) and `/meeting-intake`
> (Notion R2R) have been **removed** (ADR-0008). New projects start by cloning and
> running `/setup-project`.

## Feature packs (`packs/`)

`packs/` is a library of ready-made, **logic-first** feature modules across three groups:
**features** (payments, barcode scan, chat, feed/reels, navigation, profile/settings, auth screens,
tab bars, push, media upload, places, analytics, ai-assistant, activity-inbox, social-graph,
comments, search, maps, booking, cart-checkout, ratings-reviews); **infra primitives** (forms,
offline-sync, app-lifecycle, i18n, feature-flags). It is **excluded from the app**
(tsconfig/ESLint/Jest) — parked and inactive, adding zero weight until you opt one in with
**`/add-feature <pack>`**. Each pack ships the working background (data/state/services/migrations/
hooks) plus a **minimal, swappable UI** the design pass replaces. See `packs/README.md`. Do not
import from `packs/` in app code — install the pack instead.

## Hard rules (enforced; do not negotiate in-code)

- **Boundaries:** `src/app` (routes, THIN) → `src/features/<name>` (vertical
  slices, public API = `index.ts`) → `src/shared` (generic kit). No
  cross-feature imports; no upward imports. ESLint `boundaries/*` enforces.
- **Validate at the edges.** Everything entering the app (user input, storage
  rehydration, network) passes a Zod schema in `model/schema.ts`.
- **State:** Zustand stores live in `features/*/model/store.ts`; subscribe via
  selectors; never store derived data. `process.env` is read only by
  `src/shared/lib/env.ts`.
- **Storage & secrets (security boundary):** all persistence goes through
  `@/shared/lib/storage` — `secureStorage`/`LargeSecureStore` for secrets/PII,
  `appStorage` for non-sensitive state. Direct `AsyncStorage`/`expo-secure-store`/
  `mmkv` imports are ESLint-banned outside that folder. No secrets in source or
  `EXPO_PUBLIC_*` (it's plaintext in the bundle) — `npm run secrets:check`
  enforces this. See `docs/security/checklist.md`.
- **UI:** className + NativeWind only — no inline `style` for static styling,
  no `StyleSheet.create` in features. Use `cn()` for conditionals. Use shared
  `AppText`/`Button`/`Screen`/`TextField` primitives; extend `shared/ui`
  rather than one-off styling. Animations use Reanimated, respect
  reduced-motion, target 60fps (no JS-thread loops).
- **Every interactive or assertable element gets a `testID`** (kebab-case,
  feature-prefixed: `tasks-add-button`).
- **Tests:** colocated in `__tests__/`; never inside `src/app/` (router treats
  files there as routes). New logic ⇒ new tests; bug fix ⇒ regression test
  first. Coverage floor 60% lines (will rise).
- **Typography taste:** user-facing copy uses typographic apostrophes (’) —
  docs-lint fails on straight quotes in UI text.
- **Never** edit `ios/`/`android/` by hand (CNG owns them), commit secrets,
  use `any` without a `// why:` comment, or add a dependency without checking
  `npx expo install` compatibility + an ADR for anything architectural.
- **Conventional Commits required** — the changelog and release notes are
  generated from them, and `commitlint` enforces the format on commit.

## Pull requests — proof of work

PRs follow `.github/PULL_REQUEST_TEMPLATE.md`: link the intent (PRD/issue),
list what changed, and attach proof (test output, screenshots, simulator
recording, or an Argent session summary). CI runs the verify suite plus
persona reviews (`.claude/agents/` ↔ `docs/personas/`); resolve their P1/P2
findings before requesting human review. Releases and store builds:
`docs/runbooks/release.md`.

## When you're blocked

Stop after two failed attempts at the same fix. Re-read the relevant doc;
check `docs/quality/quality-score.md` for known landmines; then ask the human
with a concrete question ("X conflicts with Y, which wins?"). Don't push
through with hacks — and when the answer arrives, encode it (rule, test, or
doc) so the next agent never asks again.
