# ADR-0006 — The Progix operating system: one front door, four surfaces, specs + skills

- **Status:** partially superseded by [ADR-0008](0008-repo-only-operating-model.md) — the **four-surface (Notion / GitHub / Slack / repo) model and cloud CI/CD are dropped**; the repo is the only operating surface. The `specs/` track, sizing gate, constitution, and skills introduced here remain in force.
- **Date:** 2026-06-09
- **Deciders:** Achraf Arabi (lead), Ilyes Ghorieb (Progix), Mohamed Bouhezza (PM)

## Context

ADR-0005 deliberately rejected spec-kit ceremony: it kept PRDs + exec-plans as
the planning model and declined a `specs/` source of truth. That call was right
for a single repo in isolation. But a Progix project is more than a repo — it has
a client, a PM, weekly meetings whose requirements churn, a Notion workspace the
non-engineers live in, and a GitHub org. The Next.js skeleton evolved a full
**operating system** around this (a `/progix` front door, a `specs/` track, a
constitution, four-surface bookkeeping, and ~15 skills). We want both skeletons to
share one workflow so a developer moving between web and mobile learns the system
once. That requires reversing the two narrowest parts of ADR-0005 — "no `specs/`"
and "no parallel command vocabulary" — while keeping its genuinely good ideas
(the S/M/L sizing gate, bounded clarification, the reuse-inventory preflight,
"verbosity is a cost").

## Decision

Adopt the Progix operating system in this repo, mirroring the Next.js skeleton and
adapted to Expo idioms (npm, Maestro + Argent, expo-router, the `model/ui/lib`
slice anatomy).

1. **Introduce `specs/`.** Feature-track work lives in `specs/NNN-slug/`
   (`spec.md` + `plan.md` + `tasks.md`), governed by `specs/constitution.md`
   (11 articles). This **supersedes ADR-0005's** "do not adopt a `specs/` source
   of truth". PRDs remain the product-intent layer in `docs/product/prds/`; specs
   are the engineering contract per feature.
2. **Keep the sizing gate.** ADR-0005's best idea survives intact: **S**-size work
   skips all artifacts (no spec, no plan), **M/L** use the spec track. Process is
   right-sized, not always-on (Constitution Art. II).
3. **Adopt `.claude/skills/` and fold overlapping commands.** The skill ecosystem
   becomes the one vocabulary; the duplicate commands (`plan-feature`, `review`,
   `sync-docs`, `implement-prd`, `qa-cuj`) are migrated to skills so there is no
   second source of truth.
4. **One front door — `/progix`.** A new project starts from a clone and one
   message: `/progix`. It interviews, writes the PRD, creates the GitHub repo +
   board under `DigitariaWebs`, fills the Notion project from the canonical
   template, runs `/setup-project`, and emits the Claude Design prompt.
5. **Four surfaces.** _Notion explains · GitHub tracks · Slack coordinates · the
   repo enforces._ Each fact has exactly one home (Constitution Art. XI).
6. **Default automations.** A daily report compiles GitHub activity into a human
   report; serious failures auto-file issues; meeting transcripts convert to
   requirement diffs (R2R). The harness does the bookkeeping.

## Consequences

- Positive: one workflow across both skeletons; a new dev ships from one prompt;
  the PM gets a readable Notion project; requirement churn is tracked, not lost.
- Negative / accepted: we now maintain a `specs/` tree and ~15 skill prompts in
  this repo; `/progix` depends on the Notion MCP and `gh` (it degrades to
  "describe the steps" when either is absent). Token cost of daily report +
  persona review is bounded (scheduled, CI gates run before AI).
- Enforcement: `specs/constitution.md` Articles cited by skills/personas;
  `scripts/docs-lint.mjs` keeps docs honest; `.claude/settings.json` hooks protect
  paths and auto-format; ESLint `boundaries/*`, Jest, and `npm run verify` are the
  gates. The sizing gate lives in `/plan-feature`.

## Alternatives considered

- **Keep ADR-0005 as-is (PRD/exec-plan only).** Honors the prior decision and is
  less work, but the two skeletons diverge permanently and `/progix`'s spec-track
  skills would have no home — a developer would learn two systems.
- **Full copy of the Next.js OS unchanged.** Would resurrect pnpm/Playwright/
  RSC-slice assumptions that are wrong for Expo; every skill would break.
- **Skills as commands only.** Loses skill features (`disable-model-invocation`,
  argument hints, auto-discovery) that `/progix` is built around.
