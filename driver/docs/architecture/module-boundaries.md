---
id: architecture-module-boundaries
read-when: Adding files or imports anywhere — the lint-enforced layering rules live here.
owns: The app → features → shared layering and the boundaries/no-restricted-imports rules.
---

# Module Boundaries

The single most important rule in the repo. It is _statically enforced_ by
`eslint-plugin-boundaries` (see `eslint.config.js`) — you cannot merge code
that violates it.

## The matrix

| From \ may import | app          | same feature      | other feature     | shared |
| ----------------- | ------------ | ----------------- | ----------------- | ------ |
| `src/app`         | ✅ (layouts) | ✅ via `index.ts` | ✅ via `index.ts` | ✅     |
| `src/features/X`  | ❌           | ✅ (any depth)    | ❌                | ✅     |
| `src/shared`      | ❌           | ❌                | ❌                | ✅     |

Additionally, **features are only importable through their public API**
(`src/features/X/index.ts`) — deep imports are lint errors even from `app`.

## Why this exists

- **Conflict-free teamwork:** one feature = one folder = one owner (see
  `.github/CODEOWNERS`). Two squads touching two features can't collide.
- **Agent safety:** an agent told to work on `features/checkout` physically
  cannot create spaghetti into `features/profile` — the build fails. This is
  the "limit the plausible places code can go" principle.
- **Cheap deletion:** features can be removed by deleting one folder and one
  route line. Code that's cheap to delete is cheap to experiment with
  (painted-door prototypes live and die without residue).

## What to do when the rule blocks you

| Situation                         | Fix                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Two features need the same helper | Move it to `src/shared/lib`                                                                                   |
| Two features need the same UI     | Promote it to `src/shared/ui`                                                                                 |
| Feature B needs Feature A's data  | Compose at the route: the route reads A's public hook and passes props to B — or extract a shared store slice |
| You "just need one type"          | Export the type from the feature's `index.ts`                                                                 |

Changing the boundary rules themselves requires an ADR in
[decisions/](decisions/README.md).
