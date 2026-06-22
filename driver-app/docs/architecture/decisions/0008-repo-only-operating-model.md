# ADR-0008 — Repo-only operating model (drop cloud CI/CD + Notion/Slack)

- **Status:** accepted (partially supersedes [ADR-0006](0006-progix-operating-system.md))
- **Date:** 2026-06-18
- **Deciders:** Achraf Arabi (lead)

## Context

ADR-0006 adopted a "four-surface" operating system — Notion explains, GitHub tracks,
Slack coordinates, the repo enforces — plus cloud CI/CD (GitHub Actions for verify, e2e,
persona review, ship-report, deploy) and a Notion MCP server. In practice, for a small
team shipping many apps from this skeleton, that machinery is overhead: it has to be kept
in sync with the repo, it adds ceremony, and the cloud surfaces drift from the code that
is the real source of truth. Community sentiment on AI harnesses points the same way —
keep the operating model lean and let the repo + code patterns carry the load
(see `docs/research/07-community-sentiment.md`).

## Decision

**The repo is the only operating surface.** Remove the cloud ceremony; keep the local
quality gates.

1. **Remove cloud CI/CD.** Delete all GitHub Actions workflows (`ci`, `e2e-ios`,
   `claude-pr-review`, `ship-report`, `deploy-preview`, `release`, `continuous-deploy`,
   `agentic-qa`). Verification runs **locally**: `npm run verify`
   (format + lint + typecheck + test + docs-lint) and Husky pre-commit hooks.
2. **Remove Notion + Slack.** Drop the Notion MCP server from `.mcp.json`, delete
   `docs/process/notion-workspace.md` and the Notion-oriented templates, and rewrite the
   workflow doc so there is no four-surface bookkeeping. No "post it in the channel".
3. **Keep what produces real artifacts in-repo:** specs, ADRs, feature reports
   (`docs/reports/`), the `specs/` track, the sizing gate, the constitution, and the
   skills — these stay, and are de-Notioned during the Phase 5/6 docs + skills rebuild.
4. **Keep Argent** (local device QA control) — it is local automation, not cloud ceremony.
5. **Keep GitHub for code hosting** (issue/PR templates, CODEOWNERS) — hosting ≠ CI/CD.

## Consequences

- Faster, simpler loop; nothing to keep in sync outside the repo.
- No cloud enforcement — quality depends on local gates actually being run. The Phase 1
  security work strengthens these local gates (gitleaks, ESLint security, secret guards)
  precisely because there is no cloud backstop.
- Leaf references to the old four-surface model still exist in some docs/skills
  (constitution, glossary, `progix`/`meeting-intake`/`feature-report` skills, templates);
  these are cleaned during the Phase 5 docs restructure and the Phase 6 skill rebuild,
  tracked in `UPGRADE-ROADMAP.md`.
