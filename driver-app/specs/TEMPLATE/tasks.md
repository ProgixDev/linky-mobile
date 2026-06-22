# Tasks NNN — <Feature name>

Ordered, executable, checkboxed. An agent works top-to-bottom, ticks boxes as it commits, and never reorders silently. `[P]` marks tasks safe to parallelize. Every task names its files and its done-check. Keep tasks ≤ ~30 min of work each.

## Phase 0 — setup

- [ ] T0 Create branch `feat/NNN-slug`; scaffold slice with `/new-module <slug>` (or `npm run new:feature`) — files: `src/features/<slug>/*`

## Phase 1 — core behavior (AC-1, AC-2)

- [ ] T1 Schema: `model/schema.ts` Zod schema + inferred types · done: typecheck green
- [ ] T2 Store: `model/store.ts` Zustand store + actions · done: `__tests__/store.test.ts` green (AC-1 unit)
- [ ] T3 [P] UI: `ui/<x>-screen.tsx` from `src/shared/ui` primitives, all states (empty/loading/error), `testID`s on interactive elements · done: renders
- [ ] T4 Route: `src/app/.../<route>.tsx` thin screen mounts the feature · done: navigable in app

## Phase 2 — verification

- [ ] T5 E2E: `.maestro/flows/<slug>.yaml` covering CUJ steps · done: `npm run e2e:ios` green
- [ ] T6 Run `/verify-ui` — boot the app (Argent), walk the CUJ, screenshot each state, inspect against ACs; fix what you see
- [ ] T7 `npm run verify` green; commit history clean (conventional)

## Phase 3 — review & ship

- [ ] T8 Run `/review`; fix P0/P1 findings
- [ ] T9 Run `/feature-report` → `docs/reports/NNN-slug.md`
- [ ] T10 Open PR (template filled, spec + report linked)
- [ ] T11 After merge: `/update-docs` (feature doc, CUJ table, specs index status)

## AC coverage (mirror of plan.md — keep ticked in sync)

- [ ] AC-1 → T2, T5 · [ ] AC-2 → T3, T5 · [ ] AC-3 → T2/T6
