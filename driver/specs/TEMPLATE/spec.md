# Spec NNN — <Feature name>

- **Status:** draft | active | shipped | abandoned
- **Type:** feature | experiment | enhancement
- **Requested by / owner:** <name, role>
- **Date:** YYYY-MM-DD
- **Slice / areas touched:** `src/features/<slug>`, routes `app/...` <!-- used for conflict detection across active specs -->

## Problem (the why)

Two to four sentences: who hurts, how we know (evidence/link), why now. No solutions here.

## Desired behavior (the what)

Describe the behavior in user terms — what the user does and what they see. Plain prose or a short scenario list. **No tech stack, no component names** — that's `plan.md`'s job.

## Acceptance criteria

Concrete, testable, numbered. Each AC becomes a test in `tasks.md`.

- **AC-1:** Given …, when …, then …
- **AC-2:** …
- **AC-3:** (include at least one non-happy path: empty/error/offline/permission)

## Out of scope

Explicit non-goals — the cheapest way to prevent agent scope creep.

- …

## CUJ impact

- Extends CUJ-NN / registers new CUJ: <one line> (update `docs/quality/critical-user-journeys.md` at ship)

## Open questions

Resolved before `/plan-feature` proceeds (it will interview you). Delete when empty.

- [ ] …

<!-- For experiments only: -->
<!-- ## Learning goals & decision window
- We believe …; we'll know by … (metric/count)
- Decision date: YYYY-MM-DD → promote or remove -->
