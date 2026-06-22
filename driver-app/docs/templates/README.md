# Templates — the artifacts `/progix` and the workflow instantiate

These are the canonical sources for the human-facing artifacts of a project. Skills fill them in; humans read them. Keeping the master here (versioned, gated) means every project starts identical and improvements compound.

| Template                                                 | Filled by                                                      | Lives (when filled)                                                          |
| -------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [notion-project-template.md](notion-project-template.md) | `/progix`                                                      | A page under Notion → Projets                                                |
| [pm-page.md](pm-page.md)                                 | `/progix`, kept current by `/daily-report` + `/meeting-intake` | Notion → project → PM                                                        |
| [PRD template](../product/prds/_template.md)             | `/write-prd`                                                   | Notion → project → PRD (human original) + `docs/product/prds/` (repo mirror) |
| [claude-design-prompt.md](claude-design-prompt.md)       | `/progix` / `/design-prompt`                                   | Exported `.md`, pasted into Claude Design                                    |
| [daily-report.md](daily-report.md)                       | `/daily-report`                                                | Notion → project → GitHub + `docs/reports/daily/`                            |
| [meeting-notes.md](meeting-notes.md)                     | `/meeting-intake`                                              | Notion → project → Meetings                                                  |

Rule for all of them: human-readable first (the PM and the client read these), short, honest, and dated. They live in the repo (`docs/`) — the only operating surface (ADR-0008).
