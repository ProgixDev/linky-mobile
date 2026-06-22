# Notion Project Template

The canonical structure `/progix` creates under **Projets** for every new project. Extends the existing Notion template (keeps the inline Development Board + Meetings databases) and adds PRD, Feature Specs, Technical Notes, GitHub, and PM. Fill placeholders from the intake interview; never leave a section as raw placeholder text after `/progix` runs.

**Live master in Notion** — this markdown is the source of truth for structure; the live, ready-to-duplicate master page is:

- **Master template:** `Project Template v2 — Progix OS` — page id `379bfde8-7d02-81a7-8881-e89edfc4ac19` (under the **Projets** data source `collection://378bfde8-7d02-8088-941f-000bf7aa576f`).
- It already contains the seven sub-pages (PRD, Meetings, Feature Specs, Technical Notes, GitHub, Resources, PM). `/progix` **duplicates this page** (Notion `duplicate-page`) into a new project and fills it — it does not rebuild the structure from scratch. If the duplicate API is unavailable, recreate from the sections below.
- When you change this markdown, update the live master too (and vice-versa) — keep them in sync (ADR-0006 follow-up).

Page properties (Projets database): `Nom du projet`, `Description`, `Status`, `Github`, `PRD`, `Documentation`.

---

## Overview

- **Description** — one paragraph: what this product is, in plain language.
- **Status** — Planning / Active / Maintenance.
- **Client** — name + company + primary contact.
- **GitHub repository** — `https://github.com/DigitariaWebs/<repo>`.
- **PRD** — link to the PRD page (below).
- **Current focus** — what we're working on this week.
- **Current milestone** — sprint / milestone + target date.

## PRD

The product requirements — the human original (mirrored to `docs/product/prds/` in the repo). Filled by `/write-prd`. Template: `docs/product/prds/_template.md`.

## Meetings

One page per meeting (template: `docs/templates/meeting-notes.md`), newest first. Each carries decisions, action items, and the requirement diff produced by `/meeting-intake`. Keep the inline Meetings database.

## Feature Specs

Human-readable specs, one per feature — what it does, the user flow, edge cases, status. Mirrors `specs/NNN-*` and `docs/product/features/`. Start as a checklist, expand each into a sub-page as it ships.

## Technical Notes

Plain-language summaries of the decisions in `docs/architecture/decisions/` (ADRs), the stack, and gotchas — written so a PM can follow them. Not a code dump; link to the repo for detail.

## GitHub

- Repository link + the project board (embed or link).
- Open issues snapshot (including auto-filed ones).
- Latest daily report (from `/daily-report`).

## Resources

GitHub · Figma · the Claude Design ZIP · API docs · backend/mobile repos · monitoring · brand files.

## PM

The project narrated for a human running it. The most important page for the PM. Template: `docs/templates/pm-page.md`. Kept current by `/daily-report` and `/meeting-intake`.

## Tasks & meetings (no inline task database)

Tasks live in **GitHub**, not Notion — `/progix` links the project's GitHub Projects board (Backlog · Ready · In Progress · Review · Blocked · Done) into the GitHub page. GitHub owns status (four-surface rule). Meetings live as pages under the Meetings sub-page, created by `/meeting-intake`.
