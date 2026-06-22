# ADR-0001 — Feature-sliced architecture with enforced boundaries

- **Status:** accepted
- **Date:** 2026-06-06
- **Deciders:** platform team

## Context

Multiple squads + AI agents will work in one app concurrently. Hyper-growth
codebases fail by business logic spreading everywhere ("bowl of mud"), which
agents amplify: they pattern-match whatever exists. We need conflict-free
parallel work and a structure agents cannot degrade.

## Decision

Three layers — `app` (routes) → `features` (vertical slices with a public
`index.ts` API) → `shared` (generic kit) — with dependency direction and
feature isolation enforced by `eslint-plugin-boundaries` in CI. Cross-feature
imports are build failures, not review comments.

## Consequences

- Positive: squads/agents own folders without collisions; features are
  cheap to delete; CODEOWNERS maps 1:1 to folders; agents physically can't
  create spaghetti.
- Negative: occasional friction promoting shared code; route-level
  composition is slightly more verbose than direct imports.
- Enforcement: `boundaries/element-types` + `boundaries/entry-point` rules in
  `eslint.config.js`; `--max-warnings 0` in CI.

## Alternatives considered

- Layered-only (components/screens/services): poor ownership story, high
  conflict rate.
- Full Feature-Sliced Design (entities/widgets/pages): more ceremony than a
  mobile app needs; three layers cover us.
- Monorepo packages per feature: heavier tooling (Metro/EAS workarounds) for
  the same guarantees; revisit if we ship a second app.
