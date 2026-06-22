# Copilot instructions

Canonical rules: read `AGENTS.md` at the repo root and follow it exactly —
operating model, docs map, and hard rules (lint-enforced layering
app → features → shared, feature public APIs via index.ts, Zod at every
edge, Zustand selectors, NativeWind className-only styling with shared/ui
primitives, testIDs on interactive elements, Conventional Commits,
`npm run verify` before proposing completion, docs updated with code).
Reference implementation: `src/features/tasks/`.
