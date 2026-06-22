# Linky Driver

The driver-side companion app for [Linky](../linky) — Guinea’s products &
real-estate marketplace. Drivers (_livreurs_) pick up orders and, at handoff,
scan the buyer’s on-screen QR to confirm delivery and release escrow. Built on
**Expo SDK 56 · React Native 0.85 · TypeScript (strict) · expo-router · Zustand
· Zod · NativeWind · Reanimated 4 · Jest**, backed by the same Supabase project
as Linky, and wrapped in an AI-agent harness so humans _and_ coding agents ship
safely from day one.

> **New here? Read [`AGENTS.md`](AGENTS.md) first** — it is the operating
> manual for both people and AI agents, and it maps the entire docs tree.
> The deep handbook lives at [`docs/index.md`](docs/index.md).

## Quick start

```bash
nvm use                 # Node 22 (see .nvmrc)
npm install
cp .env.example .env
npm run ios             # or: npm run android / npm run web
```

## The commands that matter

| Command               | What it does                                            |
| --------------------- | ------------------------------------------------------- |
| `npm run verify`      | format + lint + typecheck + tests + docs-lint (CI gate) |
| `npm test`            | Jest + React Native Testing Library                     |
| `npm run e2e:ios`     | Maestro flows against the dev-client build              |
| `npm run new:feature` | Scaffold a feature slice that passes all boundaries     |
| `npm run doctor`      | `expo-doctor` health check                              |

## Repository shape (the 10-second tour)

```
src/app/        routes only (expo-router) — THIN
src/features/   vertical slices with a public API (index.ts)
src/shared/     ui kit, theme, lib, testing utilities
docs/           the knowledge tree (architecture, conventions, personas…)
.claude/        Claude Code commands + reviewer subagents
.github/        CI/CD: quality gates, AI review, ship reports, E2E, EAS
.maestro/       deterministic E2E flows
```

Module boundaries (`app → features → shared`) are **enforced by ESLint**,
not by convention. See
[docs/architecture/module-boundaries.md](docs/architecture/module-boundaries.md).

## CI/CD at a glance

- **ci.yml** — verify suite on every PR (lint, types, tests, docs).
- **claude-pr-review.yml** — persona-based AI review before human eyes.
- **ship-report.yml** — on merge to `main`: AI-written ship report → PDF
  artifact + Notion “What’s new” page.
- **e2e-ios.yml** — Maestro smoke + CUJ flows on a simulator build.
- **agentic-qa.yml** — nightly: Claude Code + Argent drives the app like a
  tester and files findings.
- **deploy-preview.yml / release.yml** — EAS Update previews per PR,
  fingerprint-aware store builds on release.

Secrets you need to configure once: `CLAUDE_CODE_OAUTH_TOKEN` (or
`ANTHROPIC_API_KEY`), `EXPO_TOKEN`, `NOTION_TOKEN`, `NOTION_PARENT_PAGE_ID`.
Setup steps: [docs/runbooks/repo-setup.md](docs/runbooks/repo-setup.md).

## License

Internal template — set your company license before publishing anything.
