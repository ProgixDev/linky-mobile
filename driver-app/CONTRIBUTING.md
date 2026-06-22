# Contributing

This repo is built so that **anyone on the team — engineer, PM, designer,
QA — can ship a change safely**, usually by directing an AI agent rather
than typing code. The guardrails do the protecting; your job is judgment.

## The loop

1. **Start from a written intent.** A PRD (`docs/product/prds/`), a bug
   issue, or a one-paragraph task description. If it isn't written down,
   write it down first.
2. **Branch.** `feat/<scope>-<slug>`, `fix/<scope>-<slug>`, `docs/<slug>`.
   Branches live < 2 days. Trunk is `main` and it is always releasable.
3. **Let the agent work.** Open the repo in Claude Code / Cursor / Codex.
   The agent reads `AGENTS.md` automatically. Useful commands:
   `/plan-feature`, `/implement-feature`, `/verify-ui` (see `.claude/skills/`).
4. **Prove it works.** `npm run verify` locally; attach screenshots or a
   simulator recording for UI changes (the PR template asks for proof).
5. **Open a PR.** Conventional title (`feat(tasks): add bulk complete`).
   CI + the AI reviewer personas run first; addressing their P1/P2 findings
   is mandatory before requesting human review.
6. **Merge = squash.** The squash message follows Conventional Commits —
   it feeds changelogs, the ship report, and the Notion “What’s new” page.

## Non-negotiables

- **No business logic in `src/app/`** — routes are wiring only.
- **Features are islands.** Cross-feature imports are lint errors.
- **Validate at the edges.** Anything entering the app (user input,
  storage, network) goes through a Zod schema.
- **Every UI element a test will touch gets a `testID`.**
- **Docs are code.** If your change makes a doc wrong, fixing the doc is
  part of the change (`npm run docs:lint` enforces link integrity).
- **Feedback gets encoded.** If a reviewer (human or AI) corrects something
  twice, turn the correction into a lint rule, a test, or a doc —
  see the "close the loop" section in `AGENTS.md`.

## When agents misbehave

Don't wrestle the agent in chat. Stop, diagnose which context was missing,
fix the harness (docs, rules, tests), and re-run. That fix is the deliverable.
