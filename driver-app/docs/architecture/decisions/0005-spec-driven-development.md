# ADR-0005 — Spec-driven development: absorb the ideas, reject the ceremony

- **Status:** superseded by [ADR-0006](0006-progix-operating-system.md) (2026-06-09)
- **Date:** 2026-06-06
- **Deciders:** platform team

> **Superseded.** ADR-0006 reverses two narrow parts of this decision — it
> introduces a `specs/` source of truth and a skills vocabulary to align with the
> Progix OS across both skeletons. The ideas this ADR championed (the S/M/L sizing
> gate, bounded `/clarify`, the reuse-inventory preflight, "verbosity is a cost")
> are **retained** by ADR-0006, not discarded. Read this for the rationale behind
> those ideas; read ADR-0006 for the current model.

## Context

We evaluated GitHub's spec-kit (constitution / specify / clarify / plan /
tasks / analyze / implement) and the broader SDD tool landscape, informed by
Böckeler's analysis ("Understanding Spec-Driven-Development: Kiro, spec-kit,
and Tessl", martinfowler.com, Oct 2025). Her field findings match our
priors: one-size workflows are sledgehammers for small changes; the tools
generate verbose, repetitive markdown that is worse to review than code;
templates and checklists give a false sense of control (agents still ignore
or over-follow them — including regenerating existing code as duplicates);
and spec-as-source repeats model-driven development's failed abstraction
bet, now with non-determinism added.

Our harness already covers spec-kit's core: AGENTS.md+ADRs ≈ constitution,
PRDs ≈ specify, exec plans ≈ plan, /implement-prd ≈ implement — with the
critical difference that our control comes from _enforcement_ (lint,
boundaries, tests, docs-lint, persona review, verify loop), not from
markdown the model is merely asked to respect.

## Decision

1. **Do not adopt spec-kit** (no `.specify/`, no parallel command
   vocabulary, no second source of truth).
2. **Absorb three ideas natively,** redesigned around Böckeler's critiques:
   - `/clarify` — bounded (≤5 questions, material-only, existing-code-aware,
     zero-questions-is-success). Spec-kit's version, minus coverage-theater.
   - **Sizing gate** in `/plan-feature` — S/M/L triage where S explicitly
     produces _no_ artifacts. The answer to "one workflow can't fit all
     sizes" is to make skipping the workflow a first-class outcome.
   - **Task decomposition + analyze preflight** — ordered tasks with file
     paths, `[P]` parallel markers and AC mapping; one consistency pass
     before implementing, including a reuse-inventory check that blocks
     regenerating existing code.
3. **Declare our SDD level: spec-first with durable memory.** PRDs and exec
   plans are kept as an immutable historical log (context for future
   agents), NOT continuously synced to the code. The living description of
   current behavior is code + tests + docs/architecture + CUJs. We
   explicitly reject spec-anchored-everything and spec-as-source (MDD
   lesson: wrong abstraction; we'd inherit its inflexibility plus LLM
   non-determinism).
4. **Verbosity is a cost.** Plans capped at 2 pages; clarifications at 5
   questions; preflight at one pass. Markdown a human must review competes
   with reviewing the code itself.

## Consequences

- Positive: spec-kit's genuinely useful front-end (clarify, tasks, analyze)
  without a second system; small changes stay fast; planning artifacts stay
  reviewable; the reuse-inventory guard addresses a documented failure mode.
- Negative: we maintain these prompts ourselves and won't inherit upstream
  spec-kit improvements; revisit if spec-kit stabilizes a lightweight mode.
- Enforcement: the sizing gate and caps live in the command prompts;
  AGENTS.md states the tiering; the QA persona checks AC→test mapping in
  PRs.

## Alternatives considered

- Full spec-kit adoption (`specify init . --force`): second source of truth
  outside docs-lint, generic templates blind to CUJs/testIDs/boundaries,
  uv/Python dependency, duplicate command vocabulary.
- Doing nothing: leaves the real gaps (no structured clarification, coarse
  task decomposition, no preflight consistency check) unaddressed.
