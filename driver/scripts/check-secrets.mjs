#!/usr/bin/env node
/**
 * check-secrets — a dependency-free guard against the #1 AI-coding failure mode:
 * secrets leaking into the client bundle / repo. Runs in `npm run verify` and
 * pre-commit. Complements gitleaks (broader, optional binary) with two
 * project-specific rules:
 *
 *   1. ENV NAMING — an EXPO_PUBLIC_* var whose name looks like a secret. Anything
 *      prefixed EXPO_PUBLIC_ is inlined as PLAINTEXT into the bundle, so a name
 *      like EXPO_PUBLIC_SERVICE_ROLE_KEY means a real secret is shipping public.
 *   2. HARDCODED SECRETS — secret-shaped literals (service_role JWTs, Stripe
 *      `sk_…`, Supabase `sb_secret_…`) in source/config, and in the built bundle
 *      (dist/) when present — the build-time secret-in-bundle guard.
 *
 * See docs/research/01-mobile-security.md §2 and docs/research/07-community-sentiment.md.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

const ROOT = process.cwd();
const problems = [];

const SECRET_ENV_NAME =
  /EXPO_PUBLIC_[A-Z0-9_]*(SECRET|PRIVATE|SERVICE_ROLE|TOKEN|PASSWORD|PASSWD|CREDENTIAL)[A-Z0-9_]*/g;

const SECRET_VALUE = [
  { re: /\bsk_(live|test)_[A-Za-z0-9]{8,}\b/g, what: 'Stripe secret key' },
  { re: /\bsb_secret_[A-Za-z0-9_-]{8,}\b/g, what: 'Supabase secret key' },
  // A real service_role key is a JWT — match the token shape, not the bare word
  // (which appears legitimately in security comments/guards).
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}\b/g, what: 'JWT literal' },
];

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.expo',
  'ios',
  'android',
  'coverage',
  'docs',
  '.husky',
]);
// Files that legitimately contain the patterns (the detectors / guards themselves).
// env.ts references "service_role"/"sb_secret_" only to REJECT such values.
const IGNORE_FILES = new Set(['check-secrets.mjs', 'logger.ts', 'env.ts']);

function walk(dir, exts, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (IGNORE_DIRS.has(entry)) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, exts, out);
    else if (exts.includes(extname(full)) && !IGNORE_FILES.has(basename(full))) out.push(full);
  }
  return out;
}

function scanEnvNames(files) {
  for (const file of files) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    text.split('\n').forEach((line, i) => {
      // Skip comments in .env / config.
      if (/^\s*(#|\/\/|\*)/.test(line)) return;
      for (const m of line.matchAll(SECRET_ENV_NAME)) {
        problems.push(
          `${file}:${i + 1}  secret-looking public env var "${m[0]}" — EXPO_PUBLIC_* is plaintext in the bundle. Move it server-side (EAS secret / Edge Function).`,
        );
      }
    });
  }
}

function scanValues(files, label) {
  for (const file of files) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    text.split('\n').forEach((line, i) => {
      if (/eslint-disable.*no-secrets|check-secrets:allow/.test(line)) return;
      for (const { re, what } of SECRET_VALUE) {
        if (re.test(line)) {
          problems.push(
            `${file}:${i + 1}  hardcoded ${what} in ${label} — secrets must never live in source or the bundle.`,
          );
        }
        re.lastIndex = 0;
      }
    });
  }
}

// 1. Env naming — config + env files + source.
scanEnvNames([
  ...['.env', '.env.example', '.env.local', '.env.development', '.env.production'].map((f) =>
    join(ROOT, f),
  ),
  join(ROOT, 'app.config.ts'),
  join(ROOT, 'eas.json'),
  ...walk(join(ROOT, 'src'), ['.ts', '.tsx']),
]);

// 2. Hardcoded secrets — source + config.
scanValues(
  [
    join(ROOT, 'app.config.ts'),
    join(ROOT, 'eas.json'),
    ...walk(join(ROOT, 'src'), ['.ts', '.tsx']),
  ],
  'source/config',
);

// 3. Build-time guard — scan the built bundle if present.
const distDir = join(ROOT, 'dist');
if (existsSync(distDir)) {
  scanValues(walk(distDir, ['.js', '.json', '.map']), 'the built bundle (dist/)');
}

if (problems.length > 0) {
  console.error(`\ncheck-secrets found ${problems.length} problem(s):\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('\nSecrets never belong in EXPO_PUBLIC_* vars, source, or the bundle.');
  console.error(
    'See docs/security/checklist.md (SEC-SECRET-*) and docs/research/01-mobile-security.md §2.\n',
  );
  process.exit(1);
}

console.log('check-secrets ✓ no exposed secrets or secret-looking public env vars');
