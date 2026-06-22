#!/usr/bin/env node
/**
 * check-animations — Reanimated entering/exiting must respect reduced motion.
 *
 * A component using Reanimated layout animations (`entering=` / `exiting=`) must
 * consume `useReducedMotion()` and disable the animation when it's on
 * (docs/architecture/styling.md; accessibility — Constitution Art. VII). This is a
 * file-level heuristic: any `src` file that uses entering/exiting must reference
 * `useReducedMotion`. Encoded after the spec-001 review found the rule violated in
 * two row components (the fix is `entering={reduced ? undefined : ...}`).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(process.cwd());
const src = join(root, 'src');
const errors = [];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

for (const file of walk(src)) {
  const text = readFileSync(file, 'utf8');
  if (/\b(entering|exiting)=/.test(text) && !text.includes('useReducedMotion')) {
    errors.push(
      `${relative(root, file)} uses Reanimated entering/exiting but never references ` +
        'useReducedMotion — gate it: entering={reduced ? undefined : ...}. ' +
        'See docs/architecture/styling.md',
    );
  }
}

if (errors.length > 0) {
  console.error(`\ncheck-animations failed with ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error('\nReduced-motion is part of the quality bar (Art. VII).\n');
  process.exit(1);
}

console.log('check-animations ✓ entering/exiting animations respect reduced-motion');
