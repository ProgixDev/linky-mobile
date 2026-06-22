# Specs — spec-driven development

Specs are the contract between intent (PM/design) and implementation (agents/devs) for **feature-track** work. They are deliberately lean — one page per artifact — because a spec nobody reviews honestly is process theater (Constitution, Art. II). Small (S-size) changes skip specs entirely (ADR-0005 sizing gate, retained by ADR-0006).

Governance for every change lives in [constitution.md](constitution.md).

## Lifecycle

```
/create-spec  → specs/NNN-slug/spec.md        status: draft → active
/plan-feature → plan.md + tasks.md            (clarifications resolved first)
/implement-feature                            (tasks tick as they complete)
ship → /update-docs                           status: shipped; learnings distilled
                                              into docs/product/features/<slug>.md
```

- Numbering: `NNN` is the next integer; slug is kebab-case (`001-task-capture`). Branch name matches: `feat/001-task-capture`.
- One active spec per slice at a time — `/plan-feature` flags overlaps ("areas touched") across active specs before any code exists.
- Shipped specs stay in place (history is useful) but the **living truth** moves to `docs/product/features/`. A spec older than its feature doc is expected; never "fix" old specs.
- Experiments use the same flow with `Type: experiment` and learning-goal acceptance criteria (see `docs/process/painted-door.md`).

## Artifacts (templates in [TEMPLATE/](TEMPLATE/))

| File       | Owner        | Answers                                                    |
| ---------- | ------------ | ---------------------------------------------------------- |
| `spec.md`  | PM/requester | What, for whom, why now, acceptance criteria, out of scope |
| `plan.md`  | Dev/agent    | How: design, layer placement, risks, AC→test mapping       |
| `tasks.md` | Dev/agent    | Ordered checkboxed steps an agent can execute and tick     |

## Index

| #   | Spec                                                                       | Status |
| --- | -------------------------------------------------------------------------- | ------ |
| 001 | [Assigned-deliveries list for the driver](001-assigned-deliveries/spec.md) | active |
| 002 | [Delivery detail & QR-scan handoff](002-delivery-handoff/spec.md)          | active |
