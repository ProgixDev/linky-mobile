# Git Workflow

Trunk-based, optimized for many small PRs from many parallel humans/agents.

## Branches

- `main` is protected and always releasable. No direct pushes.
- Branch names: `feat/<scope>-<slug>`, `fix/<scope>-<slug>`, `chore/…`,
  `docs/…`. Lifetime target < 2 days — slice work to fit.
- Rebase on main before review; resolve conflicts locally, never via the
  GitHub UI merge commit.

## Commits — Conventional Commits (enforced by commitlint)

```
type(scope): subject      # imperative, lower-case, no period
```

Types: `feat fix chore docs refactor test perf build ci`. Scope = feature or
area (`tasks`, `shared-ui`, `ci`). The squash-merge title follows the same
format — it becomes the changelog line, feeds the ship report PDF and the
Notion “What’s new” page, so write it for a human reader.

## Pull requests

- Small (< ~400 changed lines preferred). One intent per PR.
- Template demands: linked intent (PRD/issue), summary, **proof of work**
  (test output, screenshots/recording, or Argent session notes), docs-updated
  checkbox.
- Gates before human review: CI verify suite + persona AI review (address all
  P1/P2 findings or rebut them in-thread).
- Review SLA: same business day. Author merges (squash) after approval.
- CODEOWNERS routes by folder — features to their squad, `src/shared` +
  configs to platform, `docs/product` to PM, `.github` to platform leads.

## Conflict avoidance (how we actually prevent them)

1. One feature folder = one owner at a time; cross-cutting changes (shared/,
   configs) are announced and merged fast.
2. Lockfile conflicts: take main's `package-lock.json`, re-run `npm install`,
   commit (never hand-edit; `.gitattributes` marks it `merge=ours`).
3. Generated native dirs are never committed (CNG) — a whole class of
   conflicts deleted.

## Releases

Tag-driven (`v0.2.0`), runbook: [../runbooks/release.md](../runbooks/release.md).
