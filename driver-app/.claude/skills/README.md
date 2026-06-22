# Skills

The skills that run the work. Invoke with a slash (e.g. `/design-prompt`, `/security-review`).
Governance: `specs/constitution.md`. Operating model: repo-only (ADR-0008). Flow + roles:
`docs/process/workflow.md`.

| Skill                | Phase        | What it does                                                                                      |
| -------------------- | ------------ | ------------------------------------------------------------------------------------------------- |
| `/add-feature`       | assembly     | Installs a ready-made feature pack from `packs/` (payments, scan, chat, feed, nav…) into the app. |
| `/security-review`   | quality      | Audits the diff vs `docs/security/checklist.md` (`SEC-*`), cites rule IDs, verdict.               |
| `/store-readiness`   | quality      | Audits the app vs App Store/Play rules (`STORE-*`) before submission; READY/BLOCKED verdict.      |
| `/design-prompt`     | product      | Emits the professional Claude Design brief (token contract + anti-vibe-coding constraints).       |
| `/new-component`     | UI           | Scaffolds a tokenized, accessible shared UI primitive (lean core + generate on demand).           |
| `/daily-report`      | reporting    | Today's work → `docs/reports/daily/<date>.md`, **in French, by project** (incl. client message).  |
| `/write-prd`         | product      | Intake → PRD in `docs/product/prds/`.                                                             |
| `/create-spec`       | spec track   | Idea → `specs/NNN-slug/spec.md`.                                                                  |
| `/clarify` (command) | spec track   | Bounded ambiguity pass on a PRD/spec (≤5 questions).                                              |
| `/plan-feature`      | spec track   | Sizing gate (S/M/L) → `plan.md` + `tasks.md`, reuse inventory, AC→test map.                       |
| `/new-module`        | spec track   | Scaffolds a feature slice (`npm run new:feature` + model mirror of `tasks`).                      |
| `/implement-feature` | spec track   | Executes `tasks.md` task-by-task, gates green, checkpoint commits.                                |
| `/verify-ui`         | verification | Drives the app on the simulator with Argent, walks CUJs, attests vs ACs.                          |
| `/review`            | verification | Multi-persona review board (uses the `code-reviewer` agent + personas).                           |
| `/feature-report`    | reporting    | Markdown evidence report → `docs/reports/NNN-slug.md`.                                            |
| `/encode-lesson`     | flywheel     | Turns a correction into permanent repo machinery (lint/test/hook/doc).                            |

**Retired:** the Notion-era `/progix` (Notion+GitHub project front door) and `/meeting-intake`
(Notion R2R) skills were removed (ADR-0008, repo-only). `/setup-project` (clone init) and
`/feature-report` (in-repo evidence report) are kept — they're repo-only and Notion-free.

**Tooling note (Expo):** all skills use `npm` (not pnpm), Maestro + **Argent** for UI verification
(not Playwright), the `model/ui/lib` slice anatomy, and `app.config.ts` for app identity. Reports are
Markdown, in the repo (no cloud surface).
