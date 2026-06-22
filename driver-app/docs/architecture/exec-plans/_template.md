# Exec Plan — <title>

- **Date:** YYYY-MM-DD
- **Author:** human or agent + operator
- **Intent:** link to PRD / issue
- **Status:** draft | in-progress | shipped | abandoned (why)

## Goal & non-goals

One paragraph. What "done" observably means (which CUJ passes, which metric
moves). Explicit non-goals.

## Already exists — reuse, do not recreate

File paths of existing code this work touches or builds on. The analyze
preflight in /implement-feature checks new tasks against this list.

- `src/…`

## Tasks

Ordered; `[P]` = parallelizable with the previous task; every task names its
file path(s) and the acceptance criteria it satisfies; test tasks precede
implementation tasks.

- [ ] T1 — <verb + object> → `src/…` (AC-1)
- [ ] T2 [P] — <task> → `src/…` (AC-2)
- [ ] T3 — depends: T1 — <task> → `src/…` (AC-1, AC-3)

## Phases

### Phase 1 — <milestone>

- [ ] step
- [ ] step
      **Deliverable / proof:** e.g. failing test now passes, screenshot of state X

### Phase 2 — <milestone>

- [ ] …

## Risks & landmines

Known tricky areas (check docs/quality/quality-score.md first).

## Verification

- [ ] `npm run verify` green
- [ ] CUJ(s) exercised end-to-end (Maestro or Argent session)
- [ ] Docs updated (which?)
- [ ] Feedback encoded (new rule/test if any correction recurred)
