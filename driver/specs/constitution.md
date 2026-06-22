# Constitution

Non-negotiable principles for every change in this repository, regardless of track, author, or agent. Skills and personas cite these articles by number. Amending this file requires an ADR and engineering-leadership approval.

## Article I — The repo is the source of truth

Decisions, conventions, and product knowledge live in versioned files (`docs/`, `specs/`, ADRs) — never only in chat threads, tickets, or heads. If it isn't written here, agents may not assume it; if it's written here and wrong, fixing the doc is part of the change.

## Article II — Right-sized process

Use the lightest process that keeps quality: **S**-size work skips artifacts entirely (no spec, no plan — see ADR-0005's sizing gate, retained by ADR-0006); the spec track is for new behavior (**M/L**). Process exists to encode judgment, not to perform rigor. A spec nobody can review honestly is worse than no spec.

## Article III — Verification is evidence

Nothing is "done" on assertion. Done = gates green (`npm run verify`), acceptance criteria mapped to passing tests (Jest/RNTL or Maestro), and for UI: the running app observed end to end — screenshots/recordings captured and inspected (Argent on the simulator). Agents must attest with artifacts, not confidence.

## Article IV — Gates may not be weakened in passing

Disabling a lint rule, skipping a test, loosening tsconfig, or softening CI to make work pass is forbidden. Gate changes are their own PR with an ADR note and owner approval. (Corollary: a gate that fires wrongly twice is a bug — fix the gate properly via `/encode-lesson`.)

## Article V — Boundaries are law

The layer model (`app → features → shared`) and feature isolation are enforced by ESLint `boundaries/*`, not advised. `src/app` is thin (routes); `src/features/<name>` are vertical slices with `index.ts` as the only public API; `src/shared` is the generic kit. No cross-feature imports; no upward imports. Code that wants to cross a boundary is a design conversation (promote to `shared`, compose in `app`, or ADR), never an exception.

## Article VI — Feedback gets encoded

Any correction worth giving twice must be turned into repo machinery: a doc line, a lint rule, a test, a hook, or a persona check. The team's job is to make its own steering unnecessary.

## Article VII — Users feel quality

Accessibility (labels, roles, touch targets, reduced-motion), performance (60fps, no JS-thread animation loops, lean bundles), honest copy, and designed empty/loading/error states are part of every feature's scope — not polish to defer. The UX and QA personas hold this line.

## Article VIII — Small, reversible steps

Short-lived branches, small PRs, painted doors before build-outs (`docs/process/painted-door.md`), feature deletion as a one-folder operation (boundaries guarantee it). Prefer the change that is easy to undo; when a change is irreversible (data, contracts, native config, deletions), it requires explicit human sign-off.

## Article IX — Security is a boundary discipline

Validate at every trust boundary with Zod (user input, storage rehydration, network). Authorize every mutation, keep secrets out of the bundle (`src/shared/lib/env.ts` is the only reader of `process.env`), treat new dependencies and CI changes as attack surface. The security-engineer persona reviews anything touching these.

## Article X — Context is a budget

Docs are short, pointer-based, and current. Skills load on demand; rules are path-scoped; noisy work goes to subagents. Anything that bloats every session must justify itself.

## Article XI — Two homes, one truth

Every fact has exactly one home: **Notion explains, GitHub tracks, Slack coordinates, the repo enforces** (ADR-0006). Product intent and human docs live in Notion; tasks/issues/PRs in GitHub; conventions/specs/ADRs/gates in the repo. Mirrors are allowed only when an agent needs repo-local context — and the human-facing original stays the source of truth. Duplicating a fact as a second authority is a bug. Projects begin through one front door, `/progix`, so newcomers need not assemble the system by hand; the boring bookkeeping (issues for serious problems, daily activity reports) is automated, never skipped.
