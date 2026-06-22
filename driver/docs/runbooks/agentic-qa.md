# Runbook — Agentic QA with Argent

Argent (Software Mansion) gives agents direct control of the iOS Simulator /
Android emulator: build & launch, tap/swipe/type, read the accessibility
tree, screenshot, read console + network logs, attach the debugger and
profile (React + native). It registers as an MCP server (`.mcp.json`) plus
skills. Requires macOS + Xcode + Node 18+.

## Local (any teammate, anytime)

```bash
npx @swmansion/argent init     # one-time per machine
claude                          # in the repo; Argent tools are available
> /verify-ui                      # walks the CUJs and reports
```

Use it during development to _close the loop_: after implementing UI, have
the agent launch the app and demonstrate the acceptance criteria — attach
the transcript/screenshots to the PR as proof of work.

## Nightly CI (`agentic-qa.yml`)

A macOS runner builds the dev-client simulator app, then Claude Code runs
with the Argent MCP and the QA persona
([../personas/qa-engineer.md](../personas/qa-engineer.md)) to walk every CUJ
in [../quality/critical-user-journeys.md](../quality/critical-user-journeys.md),
try the listed edge cases, and profile flagged screens.

## Report format (the agent must follow)

```markdown
# Agentic QA — YYYY-MM-DD @ <sha>

## Verdict: PASS | PASS-WITH-FINDINGS | FAIL

## CUJ results

- CUJ-001: ✅/❌ + one line

## Findings

- [P1|P2|P3] <screen> — observed vs expected — repro steps — screenshot ref

## Performance notes

- <screen>: TTI / jank observations from profiling

## Harness proposals

- What check/test/doc would catch each finding automatically next time
```

Reports upload as workflow artifacts; P1 findings should become issues the
next morning (triage owner: QA). Persistent flakiness = a finding about the
app or the harness, never something to retry away silently.
