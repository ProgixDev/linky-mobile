---
id: TASK-001
title: Capture a task on the home screen
status: Todo
blockedBy: []
---

## Scope

Let a user type a task into the input on the home screen and add it to the pending
list. Persistence and editing are out of scope for this slice.

## Acceptance Criteria

- [ ] Typing text and tapping Add appends the task to the list
- [ ] The pending counter reflects the new count
- [ ] The empty-state disappears once the first task is added

## Edge Cases

- [ ] Empty / whitespace-only input does not add a task
- [ ] Very long text does not break the row layout

## Verification

- [ ] `npm run typecheck` green
- [ ] `maestro test .maestro/tasks/TASK-001.yml` passes on a booted simulator

## Pass Criteria

- [ ] Add flow works end to end (covered by Maestro flow)
- [ ] Counter accuracy (covered by Maestro flow)

<!-- Example task shipped with the skeleton. Delete or replace when you start real work. -->
