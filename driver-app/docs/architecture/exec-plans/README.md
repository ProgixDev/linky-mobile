# Exec Plans

An exec plan is a phased implementation plan with milestones and
deliverables, written _before_ non-trivial work and updated _during_ it.
Plans are never deleted — they form the durable log of how the system was
actually built, which future agents mine for context.

Workflow: copy [\_template.md](_template.md) to
`YYYY-MM-DD-<slug>.md`, fill in phases, keep checkboxes current, link the PR.
The `/plan-feature` Claude command generates these automatically from a PRD.
