# Agent Board

A minimal, file-based task board that drives the `/build-task` pipeline. No external
service — tasks are markdown files, the board is `scripts/agent-board.mjs`.

## Layout

```
.agent-board/
└── tasks/
    ├── _template.md     # copy this to start a new task
    └── TASK-001.md      # one file per task
```

## Task schema (frontmatter)

```yaml
id: TASK-001 # stable id, matches the filename
title: Capture a task # short imperative summary
status: Todo # Todo | In Progress | Review | Done
blockedBy: [TASK-000] # ids that must be Done before this is buildable ([] = none)
```

Body sections (filled/sharpened by `/grill-with-docs` during the pipeline):
**Scope · Acceptance Criteria · Edge Cases · Verification · Pass Criteria**.

## Status model

- **Todo** → not started. Becomes **BUILDABLE** when every `blockedBy` task is `Done`.
- **In Progress** → `/build-task` is actively building it.
- **Review** → built, PR open, waiting on CI-green + human approval.
- **Done** → merged. Unblocks dependents.

## Commands

```bash
node scripts/agent-board.mjs list                  # all tasks + BUILDABLE marker
node scripts/agent-board.mjs next                  # first buildable task
node scripts/agent-board.mjs show TASK-001
node scripts/agent-board.mjs set-status TASK-001 "In Progress"
```

`/build-task TASK-XXX` consumes this: it checks BUILDABLE, sets In Progress, builds,
tests, sets Review, and opens the PR. It never sets Done — a human does that on merge.
