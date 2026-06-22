#!/usr/bin/env node
/**
 * PreToolUse hook (Edit|Write|MultiEdit): blocks agent writes to protected paths.
 * Exit code 2 = block the tool call and feed stderr back to the agent.
 * Why: these files are either secrets, generated, or gate-bearing — changing
 * them silently is how harnesses rot (Constitution Art. IV / IX).
 */
import { relative, resolve, sep } from 'node:path';

const input = JSON.parse(await readStdin());
const filePath = input?.tool_input?.file_path ?? input?.tool_input?.path ?? '';
if (!filePath) process.exit(0);

const rel = relative(process.cwd(), resolve(filePath)).split(sep).join('/');

const PROTECTED = [
  {
    test: (p) => /^\.env(\..+)?$/.test(p) && p !== '.env.example',
    why: 'Secrets are never edited by agents. Use .env.example for shape changes and ask a human to set real values.',
  },
  {
    test: (p) => p === 'package-lock.json',
    why: 'The lockfile is generated. Run npm/npx expo install instead of editing it.',
  },
  { test: (p) => p.startsWith('.git/'), why: 'Never write into .git directly.' },
  {
    test: (p) => p.startsWith('ios/') || p.startsWith('android/'),
    why: 'Native projects are owned by Continuous Native Generation (expo prebuild). Edit app.config.ts / config plugins instead, then prebuild — hand edits get overwritten (AGENTS.md hard rules).',
  },
  {
    test: (p) => p.startsWith('.github/workflows/'),
    why: 'CI gates are protected (Constitution Art. IV). Propose workflow changes in a dedicated PR after confirming with a human — say so in chat, then a human can lift this guard for the session.',
  },
  {
    test: (p) => p === 'specs/constitution.md',
    why: 'Amending the constitution requires an ADR and leadership approval — do that first.',
  },
];

for (const rule of PROTECTED) {
  if (rule.test(rel)) {
    console.error(`BLOCKED write to ${rel}: ${rule.why}`);
    process.exit(2);
  }
}
process.exit(0);

function readStdin() {
  return new Promise((res) => {
    let data = '';
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => res(data || '{}'));
  });
}
