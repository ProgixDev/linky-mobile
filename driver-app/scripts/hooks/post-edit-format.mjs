#!/usr/bin/env node
/**
 * PostToolUse hook (Edit|Write|MultiEdit): auto-formats the edited file with Prettier.
 * Why: formatting feedback should never reach review (or burn agent turns) —
 * it's deterministic, so the harness does it.
 * Fails soft: a formatting error must never break the agent loop.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const FORMATTABLE = /\.(ts|tsx|js|jsx|mjs|cjs|json|css|md|mdx|yml|yaml)$/;

try {
  const input = JSON.parse(await readStdin());
  const filePath = input?.tool_input?.file_path ?? input?.tool_input?.path ?? '';
  if (!filePath || !FORMATTABLE.test(filePath) || !existsSync(filePath)) process.exit(0);
  execFileSync('npx', ['prettier', '--write', '--log-level', 'silent', filePath], {
    stdio: 'ignore',
    timeout: 15_000,
  });
} catch {
  // soft-fail by design
}
process.exit(0);

function readStdin() {
  return new Promise((res) => {
    let data = '';
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => res(data || '{}'));
  });
}
