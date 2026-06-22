# Runbook — One-time repo setup

Do these once when adopting the skeleton for a real product.

## 1. Identity

- `app.config.ts`: name, slug, scheme, bundle ids (all `TODO(company)` marks).
- `package.json` name; `LICENSE`; `SECURITY.md` contact.
- Replace icons/splash in `assets/images/`.

## 2. Expo / EAS

```bash
npm install && npx eas-cli login
npx eas init                 # writes projectId → put it in app.config.ts extra.eas + updates.url
npx eas update:configure
npx eas credentials          # iOS certs + Android keystore (follow prompts)
```

## 3. GitHub

- Branch protection on `main`: require PR, require checks
  (`verify`, `claude-review` optional-but-recommended, `e2e-ios`), require
  linear history, dismiss stale approvals.
- Secrets (Settings → Actions): `EXPO_TOKEN` (from expo.dev access tokens),
  `CLAUDE_CODE_OAUTH_TOKEN` (run `claude setup-token` locally on a Max plan —
  this is "use our Claude Code in CI") **or** `ANTHROPIC_API_KEY`,
  `NOTION_TOKEN` (internal integration of your Notion workspace).
- Variables: `NOTION_PARENT_PAGE_ID` (the page that hosts “What’s new”;
  share it with the integration in Notion → Connections).
- Install the **Claude GitHub App** on the repo (one-time:
  `/install-github-app` inside Claude Code, or from the claude-code-action
  README) — required by the AI review + ship-report workflows.
- Update `.github/CODEOWNERS` with real team handles.

## 4. Team tooling

- Everyone runs `npm install` once locally (husky hooks self-install via
  `prepare`).
- Argent (agentic simulator control, macOS):
  `npx @swmansion/argent init` — registers the MCP server for Claude
  Code/Cursor/etc. The repo's `.mcp.json` already declares it for Claude Code.
- Maestro CLI for local E2E: `curl -fsSL https://get.maestro.mobile.dev | bash`.
- Optional: install the Expo skills for Claude Code —
  `/plugin marketplace add expo/skills` then `/plugin install expo`.

## 5. First proof

Open a trivial PR (e.g. change the README) and watch: verify suite, AI
persona review, preview comment. Merge it and confirm the ship-report PDF
artifact + Notion page appear. If anything is red, fix the setup before
inviting the team in.
