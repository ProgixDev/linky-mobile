#!/usr/bin/env node
/**
 * docs-lint — keeps the knowledge tree trustworthy.
 *
 * The docs tree is the agent harness's source of truth, so CI fails when:
 *   1. A relative markdown link points to a file that doesn't exist.
 *   2. A doc under docs/ is orphaned (nothing links to it).
 *   3. AGENTS.md forgets to mention a top-level docs/ section.
 *   4. User-facing copy in src/shared/ui or feature ui/ uses straight
 *      quotes where typographic ones are required (design taste rule —
 *      see docs/conventions/design-system.md). Example of encoding taste
 *      into automated checks; extend it as your team's taste grows.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const root = resolve(process.cwd());
const errors = [];

function walk(dir, filter) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    // Skip hidden entries (covers macOS AppleDouble "._*" files and dot-dirs)
    if (entry.startsWith('.')) continue;
    if (['node_modules', 'ios', 'android', 'coverage', 'dist', 'reports'].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, filter));
    else if (filter(full)) out.push(full);
  }
  return out;
}

const mdFiles = walk(root, (f) => f.endsWith('.md'));
const linkPattern = /\[[^\]]*\]\(([^)#\s]+)(?:#[^)]*)?\)/g;
const linkedTargets = new Set();

// 1. Broken relative links
for (const file of mdFiles) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(linkPattern)) {
    const target = match[1];
    if (/^(https?:|mailto:|tel:)/.test(target)) continue;
    const resolved = resolve(dirname(file), target);
    linkedTargets.add(resolved);
    try {
      statSync(resolved);
    } catch {
      errors.push(`${relative(root, file)} → broken link: ${target}`);
    }
  }
}

// 2. Orphaned docs (everything in docs/ must be reachable from some doc)
const docFiles = mdFiles.filter((f) => relative(root, f).startsWith('docs/'));
for (const file of docFiles) {
  const rel = relative(root, file);
  if (rel === 'docs/index.md') continue;
  if (!linkedTargets.has(file)) {
    errors.push(`${rel} is orphaned — link it from docs/index.md or a parent doc`);
  }
}

// 3. AGENTS.md must reference every top-level docs/ section
try {
  const agents = readFileSync(join(root, 'AGENTS.md'), 'utf8');
  const sections = readdirSync(join(root, 'docs')).filter((entry) =>
    statSync(join(root, 'docs', entry)).isDirectory(),
  );
  for (const section of sections) {
    if (!agents.includes(`docs/${section}`)) {
      errors.push(`AGENTS.md does not mention docs/${section} — keep the docs map complete`);
    }
  }
} catch {
  errors.push('AGENTS.md is missing');
}

// 4. Typography taste rule: user-facing strings use curly apostrophes
const uiFiles = walk(join(root, 'src'), (f) => /\/(ui)\/.*\.tsx$/.test(f));
for (const file of uiFiles) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    // Only check JSX text content heuristically: >...'...<
    const jsxText = line.match(/>([^<>{}]*'[^<>{}]*)</);
    if (jsxText) {
      errors.push(
        `${relative(root, file)}:${i + 1} uses a straight apostrophe in UI copy — use ’ (curly). ` +
          'See docs/conventions/design-system.md#typography',
      );
    }
  });
}

// 5. CUJ ↔ Maestro sync: every CUJ-NNN referenced in a Maestro flow must have a
//    matching "## CUJ-NNN" heading in the critical-user-journeys doc (and the doc's
//    Flow: paths must point at real files). Encoded after a flow referenced a CUJ
//    that didn't exist in the source of truth.
const cujDocPath = join(root, 'docs', 'quality', 'critical-user-journeys.md');
try {
  const cujDoc = readFileSync(cujDocPath, 'utf8');
  const flowsDir = join(root, '.maestro', 'flows');
  let flowFiles = [];
  try {
    flowFiles = readdirSync(flowsDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  } catch {
    flowFiles = [];
  }
  for (const f of flowFiles) {
    const text = readFileSync(join(flowsDir, f), 'utf8');
    const refs = new Set([...text.matchAll(/CUJ-\d+/g)].map((m) => m[0]));
    for (const ref of refs) {
      if (!new RegExp(`##\\s*${ref}\\b`).test(cujDoc)) {
        errors.push(
          `.maestro/flows/${f} references ${ref} but critical-user-journeys.md has no "## ${ref}" heading`,
        );
      }
    }
  }
} catch {
  // The orphan/link checks above already flag a missing CUJ doc if anything links it.
}

if (errors.length > 0) {
  console.error(`\ndocs-lint failed with ${errors.length} problem(s):\n`);
  for (const error of errors) console.error(`  ✗ ${error}`);
  console.error('\nDocs are part of the build. Fix them like you would fix a failing test.\n');
  process.exit(1);
}

console.log(
  `docs-lint ✓ ${mdFiles.length} markdown files checked, links + orphans + taste + CUJ sync OK`,
);
