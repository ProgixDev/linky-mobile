# ADR-0003 — Zustand + Zod for state and validation

- **Status:** accepted
- **Date:** 2026-06-06
- **Deciders:** platform team

## Context

We need predictable client state with minimal boilerplate, strict TypeScript
inference, and validated data at every edge (user input, storage, network) so
agents and humans can trust types at runtime, not just compile time.

## Decision

Zustand 5 stores per feature (`model/store.ts`, curried `create<T>()`,
selector-based subscriptions, persist+AsyncStorage with validated `merge`).
Zod 4 schemas per feature (`model/schema.ts`) are the single source of domain
types via `z.infer`; all edges parse.

## Consequences

- Positive: tiny API surface to teach agents; stores testable without React;
  corrupt storage can't crash the app; schemas double as documentation.
- Negative: no built-in server-cache semantics — TanStack Query is the
  pre-approved addition when real API work starts (new ADR to confirm shape).
- Enforcement: review checklist (selectors, no derived state), schema-first
  rule in AGENTS.md, store test patterns in the reference feature.

## Alternatives considered

- Redux Toolkit: more ceremony than our state complexity warrants.
- Jotai/Recoil: atom graphs harder for agents to keep coherent.
- MobX: implicit reactivity conflicts with "explicit, greppable" principle.
