---
description: Run the full agent-board pipeline for one task — mandatory grilling, write + run Maestro locally, build, review, test, update pass criteria, open PR.
argument-hint: TASK-XXX
allowed-tools: Bash, Read, Edit, Write, Glob, Grep, Skill
---

You are running the **single-task build pipeline** for `$ARGUMENTS` (a board task id like `TASK-005`).

Work the steps in order. **Stop and report** if any step fails or a precondition is not met — do not skip ahead, and do not green-tick a criterion you did not actually verify.

## 0. Preconditions

1. Run `node scripts/agent-board.mjs list` and confirm `$ARGUMENTS` is marked `BUILDABLE` (all `blockedBy` tasks are `Done`). If it is not buildable, stop and say which blocker is open.
2. Ensure the working tree is clean (`git status`). If dirty, stop and ask.
3. Confirm the test runner is ready: `which maestro` resolves **and** a device/simulator is booted (`xcrun simctl list devices booted`). If Maestro isn't installed or nothing is booted, **stop and report** — this pipeline requires a real local Maestro run (step 5) and must not proceed without it.
4. Create/switch to branch `task/$ARGUMENTS` off the latest `dev` (`git fetch`, then branch from `origin/dev`).
5. Move the task into progress: `node scripts/agent-board.mjs set-status $ARGUMENTS "In Progress"`.

## 1. Grill the spec — MANDATORY, never skip

Read `.agent-board/tasks/$ARGUMENTS.md`, then **run `/grill-with-docs` against it.** This step is required — it is how the pipeline catches edge cases and uncovered behavior the spec missed.

Drive the grilling to completion yourself: answer every question with the most reasonable decision given the spec, the existing code, and the product direction — act as the decision-maker, don't wait for the human. Fold every resolved decision and edge case **back into the task file**: concretely into **Scope**, **Acceptance Criteria**, **Edge Cases**, and **Verification**.

The task is not ready to build until grilling has produced concrete spec refinements (new or sharpened criteria / edge cases). If grilling surfaces a genuine product question you cannot reasonably decide alone, record it in `docs/next-meeting-questions.md` and pick a sensible MVP default so the build keeps moving.

## 2. Author the Maestro flow

Write or update `.maestro/tasks/$ARGUMENTS.yml` covering this task's critical path and the edge cases grilling surfaced where a flow can exercise them (keep it focused — the task's key behavior, not a broad UI tour).

States that need seeded Supabase users (unverified / banned / missing-profile) should use `scripts/seed-test-users.mjs`. If a state genuinely cannot be automated in a flow, mark its Pass Criteria item `manual` — do **not** tick it green.

## 3. Build the task

Implement the scope in `.agent-board/tasks/$ARGUMENTS.md`. Follow the repo's existing patterns and file structure.

## 4. Convention review

Self-review the diff against the project skills before testing:

- Invoke the **react-native-skills** skill and check the changed RN/Expo code against it.
- Invoke the **supabase-postgres-best-practices** skill and check any SQL / migrations / RLS / query code against it.

Fix what the review surfaces. Summarize findings you deliberately chose not to act on.

## 5. Test — MANDATORY, both must pass

Run, and paste the real output of:

- `npm run typecheck`
- `maestro test .maestro/tasks/$ARGUMENTS.yml` — against the booted simulator/device.

Both are required gates. The **local Maestro run is mandatory** — it is the real on-device test that catches what typecheck can't. **If `maestro` is missing or no device is booted, HALT and report — do not skip it and do not open the PR.** A task does not pass without a green local Maestro run. If either fails, fix and re-run before continuing.

## 6. Update pass criteria

In `.agent-board/tasks/$ARGUMENTS.md`, tick the Acceptance Criteria / Pass Criteria / Verification boxes you genuinely verified. Leave (or annotate `manual`) anything that needs backend fixtures or human review. Then move the task to review: `node scripts/agent-board.mjs set-status $ARGUMENTS "Review"`.

## 7. Open the PR

Commit on `task/$ARGUMENTS` and open a PR into `dev` with `gh pr create`. The PR body must list:

- what was built,
- the grilling-driven spec refinements (what edge cases it surfaced),
- the typecheck + **local Maestro** results (paste pass/fail),
- which Pass Criteria are green vs. still `manual`,
- a line: "Merges only after a human reviews + approves."

The objective test gate is the **local Maestro run + `npm run typecheck`** (typecheck also re-runs as a GitHub Action on the PR). There is no EAS Maestro gate.

## 8. Report back

End with: the PR url, the board transition, and a one-line "next buildable task" from `node scripts/agent-board.mjs next`. **Do not merge** and do not start the next task — the supervised loop waits for CI-green + human approval.
