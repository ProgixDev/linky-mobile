# Painted-Door Experiments

How designers and PMs ship real, tappable product experiments without touching backend logic — and without risking the codebase. (Named after the pattern: a fully painted door that doesn't open yet, instrumented to see who tries the handle.)

## The contract

- The experiment lives **entirely inside one feature slice** (`src/features/<exp-name>/`) plus one route in `src/app/`. Module boundaries make it impossible for it to leak.
- The behavior is a **no-op stub**: the slice's store/handler validates input (Zod), records the attempt, and returns a canned success/"coming soon" response. No schema changes, no external calls, no persistence of real effects.
- Instrumentation is the point: the stub logs the interaction (count, variant) so the team gets real usage signal to decide whether to build the real thing.
- Experiments are labeled in the UI when ethically required (don't fake irreversible actions like payments or deletions).

## Workflow

1. `/create-spec` with `Type: experiment` — acceptance criteria are _learning goals_ ("≥ N users try X within a week"), not feature completeness.
2. `/new-module <exp-name>` then build the UI exactly as if real — `src/shared/ui` primitives, full states, real copy, `testID`s. The quality bar for the visible part is the normal bar; that's what makes the signal valid.
3. Stub the handler with the no-op + counter. The QA persona checks the stub _cannot_ mutate anything.
4. Ship behind the route. Collect signal. Decide.

## Endings (pick one, within the spec's stated window)

- **Promote:** write the real spec; the UI is reused, the stub is replaced. The experiment spec links to the new one.
- **Remove:** delete the slice + route (one folder, one route — boundaries guarantee this is clean). `/update-docs` records the learning in `docs/product/features/` as a "tried and decided against" note, so the lesson outlives the code.

An experiment without a decision date is a feature pretending to be an experiment — the plan template requires the window.
