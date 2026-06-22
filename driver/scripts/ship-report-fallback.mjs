#!/usr/bin/env node
/**
 * Deterministic ship report — used when no Claude credential is configured.
 * Groups Conventional Commits in the given range. Usage:
 *   node scripts/ship-report-fallback.mjs <from>..<to>
 */
import { execSync } from 'node:child_process';

const range = process.argv[2] ?? 'HEAD~1..HEAD';
const sha = execSync('git rev-parse --short HEAD').toString().trim();
const date = new Date().toISOString().slice(0, 10);

const log = execSync(`git log --pretty=format:%s§%h§%an ${range}`, {
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [subject, hash, author] = line.split('§');
    const match = subject.match(/^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/);
    return {
      type: match?.[1] ?? 'other',
      scope: match?.[2] ?? '',
      breaking: Boolean(match?.[3]),
      subject: match?.[4] ?? subject,
      hash,
      author,
    };
  });

const order = ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'build', 'ci', 'chore', 'other'];
const titles = {
  feat: 'Features',
  fix: 'Fixes',
  perf: 'Performance',
  refactor: 'Refactoring',
  docs: 'Documentation',
  test: 'Tests',
  build: 'Build',
  ci: 'CI',
  chore: 'Chores',
  other: 'Other',
};

let out = `# Ship report — ${date} · ${sha}\n\n> Range: \`${range}\` · deterministic fallback (configure CLAUDE_CODE_OAUTH_TOKEN for narrative reports)\n\n## What shipped\n`;

const breaking = log.filter((c) => c.breaking);
for (const type of order) {
  const items = log.filter((c) => c.type === type);
  if (items.length === 0) continue;
  out += `\n### ${titles[type]}\n`;
  for (const c of items) {
    out += `- ${c.scope ? `**${c.scope}:** ` : ''}${c.subject} (\`${c.hash}\`, ${c.author})\n`;
  }
}

out += `\n## Risk notes\n${
  breaking.length
    ? breaking.map((c) => `- ⚠️ BREAKING: ${c.subject} (\`${c.hash}\`)`).join('\n')
    : '- none flagged (no `!` commits in range)'
}\n\n## Follow-ups\n- — \n`;

console.log(out);
