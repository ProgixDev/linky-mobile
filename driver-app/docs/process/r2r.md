# R2R — Requirement-to-Review

Most Progix projects don't fail at the first build; they drift afterward, when requirements change in weekly meetings and the change never reaches the spec. R2R is the loop that protects the foundation as requirements churn. It complements **Initial Project Setup** (which `/progix` runs once): setup builds the foundation, R2R defends it.

## The loop

```
Meeting (tldv transcript / Slack notes)
   ↓  /meeting-intake
Requirement diff  — what to ADD · CHANGE · REMOVE · REJECT (not just "what to build")
   ↓  grill
Risk pass — pre-mortem · success metrics · edge cases · review rubric
   ↓
Spec / PRD update  — the source of truth changes first, code second
   ↓  /create-spec or /plan-feature
GitHub issue — the agent-ready task
   ↓  /implement-feature → /verify-ui
Agent review — /review against the rubric
   ↓
Human merge — decision recorded back in Notion (Meetings + decision log)
```

## What makes it different

A normal backlog only tracks **what to build**. R2R tracks the full set of moves a meeting produces:

- **Add** — genuinely new scope → new spec/PRD section.
- **Change** — a decision reversed or refined → spec diff + ADR if architectural.
- **Remove** — scope dropped → mark the spec abandoned, delete the slice (boundaries make this a one-folder operation).
- **Reject** — requested but out of scope/contract → recorded with the reason, so it doesn't quietly creep back.

## The grill (before any code)

Every diff is interrogated on four axes (grill-with-docs style):

| Axis            | The question                                   |
| --------------- | ---------------------------------------------- |
| Pre-mortem      | How could this feature fail before we ship it? |
| Success metrics | What measurable signal proves it worked?       |
| Edge cases      | What scenarios break behavior or trust?        |
| Review rubric   | What must another agent verify before merge?   |

The grill output becomes the spec's acceptance criteria and the reviewer agents' checklist — so the analysis isn't thrown away.

## Where each artifact lands (four surfaces)

- Meeting transcript + decisions → **Notion** (Meetings page) and **Slack** (the thread).
- Requirement diff + updated PRD → **Notion** (PRD, human original) mirrored to `docs/product/prds/`.
- Tasks → **GitHub** issues, linked to the spec.
- Spec, plan, evidence → the **repo** (`specs/`, `docs/reports/`).

## Running it

`/meeting-intake <transcript path or paste>` produces the diff + grill and proposes the spec/PRD updates. You approve, then the normal tracks take over (`/create-spec` for new behavior, Quick track for small changes). Cadence and roles for the meetings themselves: `docs/process/workflow.md`.
