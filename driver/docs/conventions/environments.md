# Environments & Secrets

## App variants

Three build profiles (eas.json) map to three app variants via `APP_VARIANT`:

| Variant     | Bundle id suffix | Channel     | Purpose                              |
| ----------- | ---------------- | ----------- | ------------------------------------ |
| development | `.dev`           | development | dev client, local work, E2E          |
| preview     | `.preview`       | preview     | internal QA builds + PR OTA previews |
| production  | —                | production  | stores                               |

All three install side-by-side on one device (different bundle ids — see
`app.config.ts`).

## Environment variables

- Client-visible config: `EXPO_PUBLIC_*` only, validated at startup by
  `src/shared/lib/env.ts` (Zod). Add a var ⇒ update the schema + `.env.example`
  in the same PR. **Anything `EXPO_PUBLIC_` is public — never a secret.**
- Local: `.env` (git-ignored), seeded from `.env.example`.
- CI/EAS: EAS environment variables per profile (`environment:` field in
  eas.json); GitHub Actions secrets for workflow credentials.

## Secrets inventory (GitHub Actions)

| Secret                                             | Used by                            |
| -------------------------------------------------- | ---------------------------------- |
| `EXPO_TOKEN`                                       | EAS build/update workflows         |
| `CLAUDE_CODE_OAUTH_TOKEN` (or `ANTHROPIC_API_KEY`) | AI review, ship report, agentic QA |
| `NOTION_TOKEN` + variable `NOTION_PARENT_PAGE_ID`  | What’s-new Notion page             |

Runtime version policy is `fingerprint`: JS-only changes ship OTA via EAS
Update; native-affecting changes (new native dep, config plugin change)
automatically require a new store build — CI detects this via the fingerprint
workflows, you don't decide manually. Setup steps:
[../runbooks/repo-setup.md](../runbooks/repo-setup.md).
