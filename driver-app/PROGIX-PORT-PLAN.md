# Progix OS → Expo Skeleton — Port Plan

**Status:** Draft for review · **Date:** 2026-06-09 · **Author:** Achraf (with Claude)
**Goal:** Bring the full Progix OS (`/progix` + its skill ecosystem) from `NEXTJS-SKELETON` to `EXPO-SKELETON`, adapted to Expo's idioms and "done a better way."

---

## 1. The headline finding

`/progix` is not a file you can copy. It is the front door of a **15-skill operating system** that assumes a specific repo shape (specs/, constitution, pnpm, Playwright, Next-style feature slices) which the Expo skeleton **deliberately does not have**.

The two skeletons encode two different philosophies:

|                  | NEXTJS-SKELETON (Progix OS)                                                   | EXPO-SKELETON (today)                                                                       |
| ---------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Agent invocation | `.claude/skills/` (15 skills)                                                 | `.claude/commands/` (6 commands)                                                            |
| Spec model       | `specs/NNN-slug/` + `specs/constitution.md` + spec/plan/tasks                 | **No specs/.** PRDs in `docs/product/prds/`, exec-plans in `docs/architecture/exec-plans/`  |
| SDD stance       | Full spec-track ceremony                                                      | **ADR-0005 explicitly rejects spec-kit ceremony** ("absorb the ideas, reject the ceremony") |
| Process docs     | `docs/process/` (workflow, r2r, notion-workspace, kickoff, DoD, painted-door) | `docs/runbooks/` (repo-setup, release, agentic-qa)                                          |
| Package manager  | pnpm                                                                          | npm                                                                                         |
| UI verification  | Playwright screenshots                                                        | Maestro + **Argent MCP** (simulator control)                                                |
| Reporting        | `/daily-report`, `/feature-report`                                            | `ship-report.yml` + `release-scribe` agent                                                  |
| Governance       | `specs/constitution.md` (11 Articles)                                         | ADR-0004 (ai-harness) + ADR-0005 (SDD)                                                      |

**So "port + make it better" = adapt Progix OS to Expo's existing, deliberate decisions — not overwrite them.** A blind copy would resurrect exactly the spec-kit ceremony Expo's ADR-0005 rejected, and would break on pnpm/Playwright/slice-shape assumptions baked into every skill.

There are **three decisions only you can make** (Section 5) that change the shape of the work. The rest of this plan assumes sensible defaults and flags where each decision bites.

---

## 2. The Progix ecosystem — what `/progix` actually depends on

`/progix` orchestrates these, in order: ground → intake interview → `/write-prd` → Notion project → GitHub repo+board → `/setup-project` → `/design-prompt` → hand off. The full skill set and their Expo status:

| Next.js skill         | What it does                                                                   | Expo equivalent today                                  | Port action                                                                  |
| --------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| **progix**            | One front-door orchestrator                                                    | none                                                   | **NEW** (the centerpiece)                                                    |
| **setup-project**     | Initialize a fresh clone (rename, fill overview, CODEOWNERS, ADR stub, verify) | `docs/runbooks/repo-setup.md` (prose only)             | **NEW skill**, adapt to npm + Expo files (`app.config.ts`, not `layout.tsx`) |
| **write-prd**         | Intake → PRD                                                                   | `docs/product/prds/_template.md` + `/clarify` command  | **ADAPT** — write into Expo's PRD model, not `docs/product/prd.md`           |
| **design-prompt**     | Emit Claude Design brief                                                       | none                                                   | **NEW** (near-portable; minor wording)                                       |
| **create-spec**       | Idea → `specs/NNN-slug/spec.md`                                                | **none — conflicts with ADR-0005**                     | **DECISION A** (see §5)                                                      |
| **plan-feature**      | Spec → plan.md + tasks.md                                                      | `commands/plan-feature.md` (PRD→exec-plan, S/M/L gate) | **MERGE** into existing command's model                                      |
| **implement-feature** | Execute tasks, gates green                                                     | `commands/implement-prd.md`                            | **MERGE / ADAPT** (pnpm→npm gates)                                           |
| **verify-ui**         | Playwright screenshots vs ACs                                                  | `commands/qa-cuj.md` (Argent)                          | **ADAPT** — rebuild on Argent MCP, not Playwright                            |
| **review**            | Multi-persona review board                                                     | `commands/review.md` + `code-reviewer` agent           | **ALREADY EXISTS** — reconcile, don't duplicate                              |
| **feature-report**    | Evidence report w/ screenshots                                                 | `ship-report.yml` + `release-scribe`                   | **ADAPT** — Argent evidence, npm `report:pdf`                                |
| **update-docs**       | Close docs loop after merge                                                    | `commands/sync-docs.md`                                | **ALREADY EXISTS** — reconcile                                               |
| **new-module**        | Scaffold a feature slice                                                       | `npm run new:feature` (`scripts/new-feature.mjs`)      | **WRAP** existing script as a skill (slice anatomy already Expo-correct)     |
| **daily-report**      | GitHub activity → human report                                                 | `ship-report.yml` partial                              | **NEW/ADAPT** + scheduled action                                             |
| **meeting-intake**    | Meeting → R2R requirement diff                                                 | none                                                   | **NEW** (depends on Decision A + Notion)                                     |
| **encode-lesson**     | Turn correction → repo machinery                                               | AGENTS.md step 5 (prose)                               | **NEW skill**, adapt ladder to Expo gates (ESLint/Jest/docs-lint/hooks)      |

**Bottom line:** ~5 are net-new, ~6 need adaptation, ~4 already exist in command form and must be **reconciled rather than duplicated** (the worst outcome is two `plan-feature`s and two `review`s with diverging behavior).

---

## 3. Structural prerequisites — what must exist before the skills work

Each skill reads/writes specific files. To port them we must first create or adapt the substrate in Expo:

**Process docs (port from `docs/process/`, rewritten for Expo):**

- `docs/process/notion-workspace.md` — four-surfaces + Notion structure (Notion MCP already configured in `.mcp.json` ✓). Master template id `379bfde8-7d02-81a7-8881-e89edfc4ac19` carries over verbatim.
- `docs/process/r2r.md` — Requirement-to-Review loop (only if `/meeting-intake` is in scope).
- `docs/process/workflow.md` — roles + tracks, rewritten for npm/Maestro/Argent.
- `docs/process/definition-of-done.md` — DoD mirroring `npm run verify` + Argent evidence.
- `kickoff-prompt` equivalent — Expo already front-loads grounding in AGENTS.md; fold into `/progix` step 1 rather than a separate file.

**Governance:**

- `specs/constitution.md` — the 11 Articles. **Decision C** (§5): adopt as-is, slim, or skip in favor of ADRs. Several articles already match Expo's hard rules (boundaries, gates-may-not-weaken, encode-feedback).

**Templates (port `docs/templates/`):**

- `claude-design-prompt.md`, `notion-project-template.md`, `pm-page.md`, `meeting-notes.md`, `daily-report.md` → adapt. (Expo PRD template already exists.)

**Scripts (Expo currently has `docs-lint`, `new-feature`, `ship-report-fallback`):**

- `report-to-pdf.mjs` (for feature/daily reports) — port, npm-ify.
- `protect-paths.mjs` + `post-edit-format.mjs` hooks + wire into `.claude/settings.json` — Expo's settings.json has **no hooks** today; Progix relies on them. Port and point at Prettier/ESLint.
- `auto-issue.mjs` (auto-file GitHub issues on gate failure) — optional automation.

**GitHub:** Expo already has richer workflows (agentic-qa, ship-report, claude-pr-review, continuous-deploy). `/progix`'s repo+board creation (`gh` under `DigitariaWebs`) ports directly; daily-report may become a scheduled workflow.

---

## 4. Tooling translation (applies to every ported skill)

| Next.js assumption                                             | Expo replacement                                                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm lint/typecheck/test/verify`                              | `npm run lint / typecheck / test / verify`                                                             |
| `pnpm e2e:shots` (Playwright)                                  | `npm run e2e:ios` (Maestro) + Argent MCP for screenshots/inspection                                    |
| `artifacts/screenshots/`                                       | Argent session output / Maestro artifacts                                                              |
| Slice: `store.ts`+`provider.tsx`+`actions.ts` (`"use server"`) | `model/store.ts`, `model/schema.ts`, `ui/`, `lib/`, `__tests__/` (already canonical via `new:feature`) |
| `src/app/layout.tsx` metadata                                  | `app.config.ts` (name/slug/scheme)                                                                     |
| `src/core/env.ts`                                              | `src/shared/lib/env.ts`                                                                                |
| `docs/INDEX.md`                                                | `docs/index.md`                                                                                        |
| `docs/product/overview.md`                                     | `docs/product/vision.md` + `docs/product/prds/`                                                        |
| Playwright/web personas                                        | Expo personas already exist (`docs/personas/`), incl. performance-engineer                             |

Every `allowed-tools: Bash(pnpm *)` line in each ported skill must become `Bash(npm *)`.

---

## 5. Decisions — LOCKED (2026-06-09)

Maximum-parity path chosen. Expo's Progix OS will mirror the Next.js one, adapted only for tooling/idioms.

**Decision A — Spec model → INTRODUCE `specs/`.** Add `specs/NNN-slug/` (spec/plan/tasks) + `specs/TEMPLATE/` + `specs/README.md` to Expo, exactly as Next.js. This **supersedes ADR-0005 (spec-driven-development)** — which must be done via a _new superseding ADR_, not a silent edit (Art. IV / IX). `/create-spec`, `/plan-feature`, `/implement-feature`, and R2R all target `specs/`. Expo's S/M/L sizing gate is preserved _inside_ the spec track (small work still skips artifacts).

**Decision B — Invocation → ADOPT `.claude/skills/`, FOLD commands.** Create `.claude/skills/` in Expo with all Progix skills. The overlapping commands get retired or reduced to thin pointers to avoid double sources of truth:

- `commands/plan-feature.md` → `skills/plan-feature` (keep the S/M/L gate logic)
- `commands/review.md` → `skills/review` (keeps `code-reviewer` agent)
- `commands/sync-docs.md` → `skills/update-docs`
- `commands/implement-prd.md` → `skills/implement-feature`
- `commands/qa-cuj.md` → `skills/verify-ui` (Argent)
- `commands/clarify.md` → keep (it's referenced by the spec track; can stay a command or become a skill)

**Decision C — Constitution → ADOPT all 11 articles.** Port `specs/constitution.md` verbatim, with only the tooling nouns adapted (`pnpm verify` → `npm run verify`; layer model `app → features → shared → core` already matches Expo). Skills/personas will cite articles by number, same as Next.js.

---

## 6. Proposed implementation order (after decisions)

1. **Substrate** — process docs, templates, constitution/charter, scripts, hooks wired into `.claude/settings.json`. Nothing runs without these.
2. **Reconcile existing commands** — decide skill-vs-command for `plan-feature`, `review`, `sync-docs`, `implement-prd`, `qa-cuj`; avoid double sources of truth.
3. **Leaf skills first** (no orchestration deps): `setup-project`, `write-prd`, `design-prompt`, `new-module` (wrap), `encode-lesson`.
4. **Verification/reporting skills:** `verify-ui` (Argent), `feature-report`, `daily-report`.
5. **Spec-track skills** per Decision A: `create-spec`/`plan-feature`/`implement-feature` (or PRD-track equivalents).
6. **R2R (optional):** `meeting-intake` + `docs/process/r2r.md`.
7. **`/progix` orchestrator last** — it just sequences everything above; build it once its steps exist.
8. **Dry-run end-to-end** — `/progix <name> --dry-run` must plan the whole flow creating nothing. This is the acceptance test.

---

## 7. Risks & how the "better way" shows up

- **Double sources of truth** (skill + command doing the same thing differently) — the biggest risk; Section 6.2 exists to prevent it.
- **Reversing a deliberate ADR** silently — Decision A/C must be explicit ADRs, not quiet edits (Constitution Art. IV / Expo's own gate-discipline rule).
- **Playwright→Argent gap** — `verify-ui` is the most-changed skill; Argent is interactive (simulator), so the evidence model differs from web screenshots. Worth a spike.
- **"Better way" opportunities:** Argent-based verification is richer than Playwright shots; Expo's S/M/L sizing gate is genuinely better than Next's always-on spec track and should be preserved; Expo's exec-plan-as-durable-log is arguably cleaner than specs/. The port should pull Progix's orchestration **up to** Expo's lighter process, not drag Expo down to Next's ceremony.

---

## 8. Progress

**Phase 1 — substrate: DONE (2026-06-09).** Shipped: superseding ADR-0006 (+ ADR-0005 marked superseded, decisions index updated); `specs/` tree (`constitution.md` 11 articles npm/Expo-adapted, `TEMPLATE/{spec,plan,tasks}.md`, `README.md`); `docs/process/` (workflow, definition-of-done, notion-workspace, r2r, painted-door); `docs/templates/` (notion-project-template, pm-page, meeting-notes, daily-report, claude-design-prompt, README); wired into `docs/index.md` + `AGENTS.md` (new docs map rows + Progix OS section). Hooks `scripts/hooks/{protect-paths,post-edit-format}.mjs` ported (npm/CNG-aware) and wired into `.claude/settings.json`. Gates verified in-sandbox: docs:lint ✓, format:check ✓, typecheck ✓ (lint/test pending on macOS — node_modules native-binding mismatch in the Linux sandbox). `report-to-pdf.mjs` deferred to the `/feature-report` phase (depends on a rendering toolchain decision; Expo has no Playwright). `auto-issue.mjs` deferred to the daily-report phase.

**Phase 2 — reconcile commands → skills: DONE (2026-06-09).** Created `.claude/skills/` with six skills: `create-spec`, `plan-feature` (merges the S/M/L sizing gate + reuse-inventory preflight, outputs `specs/`), `implement-feature` (folds `implement-prd`, npm gates, `new:feature`), `verify-ui` (rebuilt on Argent/Maestro, folds `qa-cuj`), `review` (uses the `code-reviewer` agent + personas, folds `review`), `update-docs` (folds `sync-docs`). Deleted the five overlapping commands; only `clarify` remains a command (no duplicate). Fixed stale references to retired names in `agentic-qa.md`, `prds/README.md`, `exec-plans/_template.md`, `CONTRIBUTING.md` (ADR-0005 left untouched — it's immutable history). Gates: format:check ✓, docs:lint ✓, typecheck ✓.

**Open loose end (noted):** `docs/architecture/exec-plans/` now overlaps `specs/NNN/plan.md` as a home for "how". Decide in a later phase whether exec-plans become L-size-only durable logs or are folded into specs/. Not blocking.

**Phase 3 — leaf skills: DONE (2026-06-09).** Added five independent skills: `setup-project` (Expo: app.config.ts + package.json rename, vision.md, CODEOWNERS, data-layer ADR/env stub, demo-feature removal, `npm run verify`), `write-prd` (writes `docs/product/prds/NNNN-*` from the Expo PRD template), `design-prompt` (WebSearch-current brief from `docs/templates/claude-design-prompt.md`), `new-module` (wraps `npm run new:feature` then guides the `model/schema.ts` + `model/store.ts` mirror of `src/features/tasks`), `encode-lesson` (enforcement ladder mapped to ESLint/Jest/docs-lint/hooks/personas/ADR). Gates: format:check ✓, docs:lint ✓, typecheck ✓. Skill count: 11; commands: just `clarify`.

**Phase 4 — reporting skills: DONE (2026-06-09).** Added `feature-report` (Markdown evidence report → `docs/reports/NNN-slug.md`, AC→evidence table, Argent screenshots copied to `docs/reports/<slug>/img/`) and `daily-report` (GitHub activity → `docs/reports/daily/<date>.md` + Notion). **Decision applied: reports are Markdown only — `report-to-pdf` is dropped entirely; evidence is Argent (the mobile Playwright-alternative), not Playwright.** Created `docs/reports/` (README = report structure spec + `daily/`), wired into AGENTS.md docs map + `docs/index.md`. Also moved `design-prompt` output to a root `design/` dir (outside `docs/`) so exported briefs never trip docs-lint. Gates: format:check ✓, docs:lint ✓, typecheck ✓. Skill count: 13.

**Phase 5 & 6 — R2R + orchestrator: DONE (2026-06-09).** Added `meeting-intake` (transcript → add/change/remove/reject diff + grill → spec/PRD updates; Notion-export fallback to a root `notion-export/`) and the `/progix` orchestrator (`disable-model-invocation`, dry-run mode, grounding receipt folded in, sequences write-prd → Notion duplicate → `gh` repo/board under DigitariaWebs → setup-project → design-prompt). Added `.claude/skills/README.md` cataloguing the ecosystem. **The full 15-skill Progix OS now exists in Expo**, matching the Next.js skeleton, fully Expo-adapted (npm · Maestro+Argent · `model/ui/lib` slices · app.config.ts · Markdown reports).

**Phase 7 — acceptance audit: PASS (2026-06-09).** Static checks all green: (1) every skill's frontmatter `name` matches its dir + has a description; (2) every `/skill` cross-reference across skills resolves to a real skill/command file; (3) no dangling references; (4) all 8 docs `/progix` reads in Step 1 exist. Plus repo gates: format:check ✓, docs:lint ✓, typecheck ✓. (Interactive `/progix --dry-run` and `npm run lint`/`test` to be run by a human on macOS — the sandbox can't load the macOS-native lint/test binaries, and skill invocation is interactive.)

## 9. Status: port complete

All 15 skills ported (`progix`, `setup-project`, `write-prd`, `design-prompt`, `create-spec`, `plan-feature`, `new-module`, `implement-feature`, `verify-ui`, `review`, `feature-report`, `daily-report`, `update-docs`, `meeting-intake`, `encode-lesson`) + `clarify` kept as a command. Substrate (specs/constitution + templates, docs/process, docs/templates, docs/reports, hooks) in place; ADR-0006 supersedes ADR-0005; AGENTS.md + docs/index.md wired.

**Human follow-ups before first use:** run `npm run lint` + `npm test` on macOS to confirm the two native-binding gates; do a live `/progix --dry-run` smoke test; decide the `exec-plans` vs `specs/plan.md` overlap (Section 8 loose end); confirm the Notion master-template id is reachable from this workspace's Notion connection.

---

### Phase 1 reference (the original step list, now complete)

The next concrete action was **Phase 1 substrate**, which the rest depends on:

1. Write the **superseding ADR** in `docs/architecture/decisions/` that reverses ADR-0005 and records the move to `specs/` + skills (required before any spec/ scaffolding — Art. IV).
2. Scaffold `specs/` — `constitution.md` (all 11 articles, npm-adapted), `specs/TEMPLATE/{spec,plan,tasks}.md`, `specs/README.md`.
3. Port process docs into `docs/process/` (workflow, notion-workspace, r2r, definition-of-done) and templates into `docs/templates/`.
4. Port scripts + wire hooks into `.claude/settings.json` (`protect-paths`, `post-edit-format`, `report-to-pdf`; `auto-issue` optional).

Then Phases 2–8 from Section 6 (reconcile commands → leaf skills → verification/reporting → spec-track → R2R → `/progix` → dry-run acceptance test).

Recommended: I scaffold Phase 1 next, opening with the superseding ADR for your approval before touching `specs/`.
