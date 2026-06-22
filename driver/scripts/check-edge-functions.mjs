#!/usr/bin/env node
/**
 * check-edge-functions — every Supabase edge function declares verify_jwt.
 *
 * Each `supabase/functions/<name>/` must have a `[functions.<name>]` block in
 * `supabase/config.toml` with an explicit `verify_jwt = true|false`. This forces a
 * deliberate auth decision per function (the gateway gate on top of any in-function
 * check). Encoded after the spec-001 review found a new function shipped without its
 * config block.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const fnDir = join(root, 'supabase', 'functions');
const configPath = join(root, 'supabase', 'config.toml');
const errors = [];

if (!existsSync(fnDir)) {
  console.log('check-edge-functions ✓ no supabase/functions to check');
  process.exit(0);
}

const config = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '';
const names = readdirSync(fnDir).filter(
  (e) => !e.startsWith('.') && statSync(join(fnDir, e)).isDirectory(),
);

for (const name of names) {
  const header = `[functions.${name}]`;
  const idx = config.indexOf(header);
  if (idx === -1) {
    errors.push(`config.toml is missing ${header} — declare verify_jwt for this function`);
    continue;
  }
  const after = config.slice(idx + header.length);
  const next = after.indexOf('\n[');
  const block = next === -1 ? after : after.slice(0, next);
  if (!/\bverify_jwt\s*=\s*(true|false)\b/.test(block)) {
    errors.push(`config.toml ${header} must set verify_jwt = true|false explicitly`);
  }
}

if (errors.length > 0) {
  console.error(`\ncheck-edge-functions failed with ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error('\nEvery edge function needs an explicit verify_jwt (security boundary).\n');
  process.exit(1);
}

console.log(`check-edge-functions ✓ ${names.length} function(s) declare verify_jwt`);
