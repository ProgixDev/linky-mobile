# PRD-0001 — Task capture

- **Status:** shipped (reference PRD — the example feature implements it)
- **Author / Date:** platform team, 2026-06-06
- **Owner squad:** platform
- **Links:** `src/features/tasks/`, flows `.maestro/flows/tasks-cuj.yaml`

## Problem

New team members and agents need a complete, end-to-end worked example of the
architecture; an empty skeleton teaches nothing and invites pattern drift.

## Goal & success metric

A contributor (human or agent) can point at one feature that exercises every
convention. Metric: zero architecture questions answerable by reading
`features/tasks`.

## Solution sketch

Single screen: header with pending count, input + Add button, animated task
list with toggle/delete, empty state. Uses `Screen`, `AppText`, `Button`,
`TextField`; store persisted with corrupt-data recovery.

## Acceptance criteria (become tests)

- [x] GIVEN empty input WHEN Add pressed THEN inline error “Title is required”
- [x] GIVEN valid title WHEN added THEN it appears at top, input clears, count updates
- [x] GIVEN a task WHEN toggled THEN done styling + count update (a11y: checkbox state)
- [x] GIVEN a task WHEN deleted THEN it leaves with exit animation
- [x] Storage with corrupt JSON rehydrates to empty list (no crash)
- [x] testIDs: `tasks-screen, tasks-input, tasks-add-button, tasks-pending-count, task-row-*, task-toggle-*, task-delete-*, tasks-empty, tasks-input-error`

## Non-goals

Sync, reminders, multi-list. This is a teaching feature.

## Proof

Jest suite green; Maestro `tasks-cuj.yaml` passes on simulator build.

## Rollout

Ships with the skeleton; delete the feature when the first real feature lands
(one folder + one route line — that's the point).
