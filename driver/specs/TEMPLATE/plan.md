# Plan NNN — <Feature name>

- **Spec:** [spec.md](spec.md) (all open questions resolved: yes/no)
- **Author:** <dev/agent> · **Date:** YYYY-MM-DD
- **Size:** S | M | L (S → no plan needed; this template is for M/L — see ADR-0005 sizing gate)

## Approach

One paragraph: the shape of the solution and the key trade-off taken. If an ADR is needed (new dep, boundary change, native module), link it here — write it before implementing.

## Placement (per `docs/architecture/module-boundaries.md`)

| What             | Where                  | Notes                                               |
| ---------------- | ---------------------- | --------------------------------------------------- |
| Route(s)         | `src/app/...`          | thin screen (expo-router); no logic                 |
| Slice            | `src/features/<slug>/` | `model/store.ts`, `model/schema.ts`, `ui/`, `lib/`  |
| Shared additions | `src/shared/ui/...`    | only with a second consumer or design-system intent |

## Data & state

- Async data: …(fetch where, cache how)
- Client state: …(Zustand store shape in `model/store.ts`, or "none — local/route state")
- Validation: …(every edge input passes a Zod schema in `model/schema.ts`)

## Acceptance criteria → verification mapping

| AC   | Proven by                                                             |
| ---- | --------------------------------------------------------------------- |
| AC-1 | unit: `__tests__/store.test.ts` / e2e: `.maestro/flows/<slug>.yaml` … |
| AC-2 | …                                                                     |

## Risks & unknowns

- …(and how the plan de-risks them — spike task, painted door, EAS profile, native dep)

## Overlap check

Active specs touching the same areas: none / spec NNN → resolution (sequence, coordinate, split).
