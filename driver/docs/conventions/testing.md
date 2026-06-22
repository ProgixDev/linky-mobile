# Testing

Strategy: a fast deterministic pyramid in CI plus an agentic exploratory
layer. A change without proof doesn't merge.

## Layers

| Layer                         | Tool                 | Lives in               | Gate                 |
| ----------------------------- | -------------------- | ---------------------- | -------------------- |
| Unit (logic, stores, schemas) | Jest                 | `__tests__/*.test.ts`  | every PR             |
| Component (render + interact) | jest-expo + RNTL 13  | `__tests__/*.test.tsx` | every PR             |
| E2E deterministic (CUJs)      | Maestro              | `.maestro/flows/`      | every PR (sim build) |
| Agentic exploratory QA        | Claude Code + Argent | nightly workflow       | report, not gate     |

## Rules

- Tests are colocated in `__tests__/` next to the code — **never in
  `src/app/`** (router scans it).
- Render through `@/shared/testing/render` (it wraps required providers);
  `react-test-renderer` is dead (React 19) — RNTL only.
- Query priority: `getByTestId` for structure, `getByText/Role` for behavior
  visible to users. Every interactive element ships a kebab-case, feature-
  prefixed `testID` (`tasks-add-button`) — that contract is shared by RNTL,
  Maestro and Argent.
- Store tests reset state in `beforeEach` (pattern in
  `src/features/tasks/__tests__/store.test.ts`).
- Bug fix ⇒ regression test _first_, watch it fail, then fix.
- Coverage floor: 60% lines globally (jest.config.js). Raise it as the app
  grows; never lower it to merge.
- Mock at the boundary (AsyncStorage, network), not the middle. Global mocks
  live in `jest.setup.ts`; feature mocks next to the feature's tests.

## E2E (Maestro)

Each Critical User Journey in
[../quality/critical-user-journeys.md](../quality/critical-user-journeys.md)
gets one YAML flow. Keep flows short, assert on testIDs and user-visible
text. Local run: build a dev-client sim build, then `npm run e2e:ios`.

## Agentic QA (Argent)

Nightly, an agent boots the simulator build and _plays tester_: walks each
CUJ, tries edge cases, screenshots anomalies, profiles slow screens, and
files a structured report. Runbook:
[../runbooks/agentic-qa.md](../runbooks/agentic-qa.md).
