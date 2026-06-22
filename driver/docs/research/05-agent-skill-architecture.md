---
id: research-agent-skill-architecture
read-when: Implementing Phase 5 (docs for AI) and Phase 6 (skills) — building skills, hooks, subagents, and AI-legible docs.
owns: Verified 2025-2026 Claude Code skill/plugin/hook/subagent patterns + reusable templates. Includes corrections to common myths.
---

# Advanced Claude Code Harness Patterns — 2025–2026

Verified against primary Anthropic docs; corrections to common secondary-source myths flagged **[corrected]**.

## 1. Agent Skills

- A skill is a directory with `SKILL.md` (+ optional `reference.md`, `scripts/`, templates). ([skills](https://code.claude.com/docs/en/skills))
- **Frontmatter that matters:** `description` (what + when, key use case first — drives auto-load), `when_to_use` (extra triggers), `argument-hint`/`arguments` ($-substitution), `allowed-tools` (pre-approves, does NOT restrict), `disallowed-tools` (removes from pool), `disable-model-invocation:true` (user-only `/name`), `user-invocable:false` (Claude-only background knowledge), `context: fork` + `agent:` (run in a subagent), `paths:` (auto-load only on matching files), `hooks`, `model`/`effort`.
- **Progressive disclosure (3 levels):** metadata (name+description, always in context) → body (loaded when relevant) → bundled files/scripts (loaded on demand → effectively unbounded context).
- **[corrected] Limits:** listing cap is **1,536 chars** combined description+when_to_use (not 1,024); budget scales at ~1% of context window. Keep SKILL.md **<500 lines**.
- **[novel] Lifecycle:** once invoked, the rendered SKILL.md stays in the conversation **all session** (Claude doesn't re-read). After compaction, the most recent invocation of each skill is re-attached (first 5,000 tokens each, 25,000 combined). → Write **standing instructions**, not one-time steps; every line is a recurring token cost.
- **Scripts vs prose:** prose for judgment/workflow; **scripts for deterministic, token-heavy work** (sorting, parsing, querying). The PDF skill runs a Python script without loading the script or PDF into context — only output costs tokens.
- **The "data + query script behind a skill" pattern** (this is how ui-ux-pro-max works): ship a CSV/JSON/SQLite + a query script; Claude calls `script --query X` and only the filtered result enters context. Use `${CLAUDE_SKILL_DIR}` for portable paths.
- **[corrected] Commands ARE skills now:** "Custom commands have been merged into skills." `commands/deploy.md` and `skills/deploy/SKILL.md` both make `/deploy`; skill wins on conflict.
- **Descriptions that trigger:** what it does + when, key use case first, natural keywords the user says. Over-triggers → make specific or `disable-model-invocation`. Under-triggers → add trigger keywords; run `/doctor`. **[corrected]** no third-person mandate in the Code docs.

## 2. Plugins

- A plugin bundles **skills + agents + hooks + MCP** (+ output-styles). Layout: `.claude-plugin/plugin.json` (only `name` required) at root; component dirs (`skills/`, `agents/`, `commands/`, `hooks/hooks.json`, `.mcp.json`) at root. `${CLAUDE_PLUGIN_ROOT}` for scripts.
- **Marketplace** = git repo with `.claude-plugin/marketplace.json`. `/plugin marketplace add owner/repo`, `/plugin install name@marketplace`.
- **Team distribution:** `enabledPlugins` + `extraKnownMarketplaces` in committed `.claude/settings.json`; semver constraints; git tags `name--vX.Y.Z`. Trust: approving a plugin approves its whole supply chain.
- **[new]** A _skill folder_ with `plugin.json` loads as a plugin bundling its own hooks/MCP/agents.

## 3. Hooks (local gates, no cloud CI)

- **PreToolUse** blocks via exit code 2 (stderr → Claude) or JSON `permissionDecision:"deny"`. Matchers are tool-name regex (`Edit|Write`, `Bash`, `*`). Stdin JSON carries `tool_input.file_path`, `tool_input.command`, etc.
- **PostToolUse** formatter: read path via `jq -r '.tool_input.file_path'` → `prettier --write`.
- Useful events: PreToolUse, PostToolUse, PostToolUseFailure, UserPromptSubmit, Stop, SubagentStart/Stop, PreCompact, SessionStart/End, PermissionRequest.
- **Stop hook** can run lint/typecheck/test and exit 2 to block turn completion — but auto-overrides after 8 consecutive blocks; early-exit when `stop_hook_active`.
- **Security:** hooks run arbitrary shell automatically — quote `"$VAR"`, block `..`, absolute script paths.
- Hooks = deterministic invariants; skills/agents = probabilistic judgment.

## 4. Subagents

- Markdown + frontmatter (`name`, `description`, `tools`, `model`, `disallowedTools`, `permissionMode`) in `.claude/agents/`. `description` drives auto-delegation.
- **Context isolation** is the core benefit: own context window; intermediate noise (reads/greps/logs) stays isolated; only the final result returns to the parent.
- **Orchestrator-worker** pattern: +90.2% over single-agent on Anthropic's research eval, at **~15× tokens** [corrected from "~7×"]. Start simple; add complexity only when it pays.
- **Skill↔subagent:** a skill with `context: fork` + `agent: Explore` runs isolated seeing only the SKILL.md; a subagent can preload skills via a `skills:` field.
- **Persona review board:** (A) one `code-reviewer` adopting personas sequentially (cheap, single context — what this skeleton does) or (B) parallel fan-out to specialists (faster, more tokens). Restrict to read-only tools.

## 5. AI-legible repos (context engineering)

- Keep CLAUDE.md/AGENTS.md **short and high-signal** ("too long → Claude ignores half"). The `@AGENTS.md` import pattern this skeleton uses is correct. Imports load at launch (don't save context).
- **Path-scoped retrieval (high-value):** scope rules/skills with `paths:` globs so they auto-load only when Claude touches matching files — the cleanest "read-when" metadata.
- **Just-in-time over indexes:** Anthropic deliberately uses glob/grep over pre-built indexes ("naively dropped into context up front… vs retrieve just-in-time, bypassing stale indexing"). A machine-readable index should be a **small pointer table ("read X when Y")**, not a dump.
- **Right altitude:** "specific enough to guide behavior, flexible enough for judgment." Bloated context is "the silent killer of agent reliability."

## 6. Artifact-producing skills

From _Writing tools for agents_: configurable verbosity (concise/detailed), paginate/filter large results, unambiguous param names, error messages that guide toward token-efficient strategies. **Subagents write outputs to disk and return lightweight references** — for `/daily-report` or `/store-readiness`: write the dated `.md`, **return only the path + a 3-bullet summary.**

## 7. /daily-report + audit-skill patterns

- **Dynamic context injection** (`` !`cmd` `` runs before Claude sees the prompt). `/daily-report`: `!`git log --since=midnight``, `!`git diff --stat`` → write `reports/$(date +%F).md`, return path + summary. `allowed-tools: Bash(git *)`.
- **Audit skills** (e.g. `/store-readiness`): bundle the rule catalog as `references/checklist.md` (CSV/MD with rule IDs, loaded only when the skill runs); output `[P1|P2|P3] RULE-ID — file:line — issue — fix`; end with a verdict + write an artifact. Optionally `context: fork` + `agent: Explore` + read-only tools.

## 8. Worth adopting (2025–2026)

- **Output styles** (frontmatter appended to system prompt). **Checkpointing/Rewind** (auto-snapshot before edits). **`/run`, `/verify`, `/run-skill-generator`** (record a launch recipe so Claude verifies against the _running_ app — great for Expo + Next). MCP `.mcp.json` (local/project/user scope).

## (a) Architecture recommendation for this skeleton

1. **Ship the harness as a versioned plugin per skeleton** (`expo-harness`, `nextjs-harness`) — skills+agents+hooks+MCP travel together, semver-tagged. `.claude/` for project-only overrides.
2. Docs are the source of truth; skills/rules are digests. Keep AGENTS.md short, `@`-import into CLAUDE.md. Convert path-specific guidance to `paths:`-scoped skills/rules.
3. **Skills to build:** `/daily-report`, `/security-review` (fork to read-only Explore, cite rule IDs from `references/security-checklist.md`), `/store-readiness` (Expo-only checklist audit), `/new-component` (`arguments:[name,kind]`, reads `references/component-template.tsx`, enforces boundaries). Adopt `/run-skill-generator`.
4. **Hooks (local gates):** PreToolUse `Edit|Write` blocks writes to protected paths (`.env*`, lockfiles, `src/core/**`); PostToolUse formats edited file; Stop runs typecheck+lint (guarded by `stop_hook_active`).
5. **Subagents:** keep the single multi-persona `code-reviewer` default; opt-in parallel fan-out for release reviews. Read-only tools, `model: inherit`.
6. **Token hygiene:** SKILL.md <500 lines, heavy material in `references/`, audit skills return paths not content. Run `/doctor`.

## (b) Templates

**SKILL.md:**

```markdown
---
name: <kebab-name>
description: <what it does> — <verb>. Use when <natural triggers / file types>.
when_to_use: <extra trigger phrases>
allowed-tools: Read, Grep, Glob, Bash(git *)
disable-model-invocation: false # true => side-effecting, user-only
paths: src/**/*.tsx # optional auto-load scope
context: fork # optional isolated run
agent: Explore
---

## Context

!`git diff main...HEAD --stat`

## Task

Standing instructions (persist all session).
For each finding: [P1|P2|P3] RULE-ID — file:line — issue — fix.
Write reports/<name>-$(date +%F).md; return only path + 3-bullet summary.

## Resources (loaded on demand)

- references/checklist.md - scripts/<helper>.py via ${CLAUDE_SKILL_DIR}/scripts/
```

**Subagent (`.claude/agents/<name>.md`):**

```markdown
---
name: appsec-reviewer
description: Application security reviewer. Use proactively on diffs touching auth, server actions, route handlers, env/config, middleware, deps.
tools: Read, Grep, Glob, Bash
model: inherit
---

You are the AppSec reviewer.

1. Read docs/personas/appsec-engineer.md for your lens + output format.
2. Diff via git diff <base>...HEAD. Prioritize \*.actions.ts, route handlers, middleware, env, lockfiles.
3. One finding per line: [P1|P2|P3] RULE-ID — file:line — issue — attack scenario — fix.
4. End with ## Verdict: APPROVE | REQUEST-CHANGES (any P1 => REQUEST-CHANGES).
5. ## HARNESS: propose a lint rule/hook/path-scoped skill for any recurring finding.
   Return only findings + verdict + harness proposals.
```
