# Knowledge Tree

Everything the team — and every AI agent — needs to work on this codebase.
`AGENTS.md` is the entry point; this index is the full table of contents.
docs-lint keeps every page linked and every link alive.

## Architecture

- [Overview](architecture/overview.md) — system shape, layers, data flow
- [Backend (Supabase)](architecture/backend.md) — client, auth, RLS-first DB, payments
- [Module boundaries](architecture/module-boundaries.md) — the lint-enforced layering
- [State management](architecture/state-management.md) — Zustand + Zod patterns
- [Navigation](architecture/navigation.md) — expo-router conventions
- [Styling](architecture/styling.md) — NativeWind, tokens, animations
- [Decisions (ADRs)](architecture/decisions/README.md) — why things are this way
- [Exec plans](architecture/exec-plans/README.md) — durable implementation logs

## Conventions

- [Code style](conventions/code-style.md)
- [Testing](conventions/testing.md)
- [Git workflow](conventions/git-workflow.md)
- [Design system](conventions/design-system.md) — the token contract
- [Environments & secrets](conventions/environments.md)

## Design

- [Quality bar](design/quality-bar.md) — premium vs "vibe-coded"; the checklist every screen must clear
- [Claude Design prompt template](templates/claude-design-prompt.md) — the professional brief (`/design-prompt` fills it)

## Product

- [Vision](product/vision.md)
- [PRDs](product/prds/README.md) — feature specs that agents implement

## Quality

- [Critical user journeys](quality/critical-user-journeys.md) — what must never break
- [Quality score](quality/quality-score.md) — living code-health notes

## Personas (reviewer lenses)

- [Frontend architect](personas/frontend-architect.md)
- [UX reviewer](personas/ux-reviewer.md)
- [Security engineer](personas/security-engineer.md)
- [Performance engineer](personas/performance-engineer.md)
- [QA engineer](personas/qa-engineer.md)

## Process (repo-only operating model — see [ADR-0008](architecture/decisions/0008-repo-only-operating-model.md))

- [Workflow](process/workflow.md) — roles, the two tracks, working without conflicts
- [Definition of done](process/definition-of-done.md) — the done checklist both tracks enforce
- [R2R — Requirement-to-Review](process/r2r.md) — how requirement churn reaches the spec
- [Painted-door experiments](process/painted-door.md) — ship clickable experiments safely

## Security

- [Threat model](security/threat-model.md) — assets, trust boundaries, attacker classes, data classification
- [Security checklist](security/checklist.md) — the enforceable rule catalog (`SEC-*` rule IDs)
- Coverage matrix: [SECURITY.md](../SECURITY.md) (repo root)

## Store compliance

- [Apple App Review](store/apple-app-review.md) — the rules that reject apps like ours (with guideline numbers)
- [Google Play](store/google-play.md) — data safety, permissions, target API, billing, deletion
- [Store-readiness checklist](store/checklist.md) — `STORE-*` rule catalog (the `/store-readiness` skill cites these)
- [Submission runbook](store/submission-runbook.md) — step-by-step pre-submission process

## Research (upgrade evidence base)

- [Research briefs](research/README.md) — cited 2025–2026 research grounding the skeleton upgrade (security, store compliance, Supabase, design, skills, stack, community)

## Templates

- [Templates index](templates/README.md) — the human-facing artifacts `/progix` instantiates

## Reports

- [Reports](reports/README.md) — feature evidence reports + daily activity reports (Markdown)

## Specs & governance

- [Constitution](../specs/constitution.md) — non-negotiable principles, cited by article
- [Specs](../specs/README.md) — spec-driven development lifecycle and index

## Runbooks

- [Repo setup (one-time)](runbooks/repo-setup.md)
- [Release](runbooks/release.md)
- [Agentic QA with Argent](runbooks/agentic-qa.md)

## Reference

- [Glossary](glossary.md)
