#!/usr/bin/env node
/**
 * check-store-readiness — a pre-submission gate. Catches the App Store / Play
 * rejections that automation CAN catch, so they never reach a reviewer. The
 * human/skill checklist (docs/store/checklist.md) covers the rest.
 *
 * NOTE: this is intentionally NOT part of `npm run verify`. The skeleton itself
 * legitimately ships placeholder identity (com.yourcompany, slug "skeleton")
 * until you brand a real app — so this will (correctly) report findings on the
 * bare skeleton. Run it before submitting a real app: `npm run store:check`.
 *
 * Rule IDs map to docs/store/checklist.md.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const findings = [];
const add = (sev, id, msg) => findings.push({ sev, id, msg });

function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, exts, out);
    else if (exts.includes(extname(full))) out.push(full);
  }
  return out;
}

// 1) Placeholder copy in shipped UI (STORE-APL-2.1-COMPLETE). High-signal,
//    user-facing junk phrases only (avoids matching prop names / comments).
const JUNK = [/coming soon/i, /lorem ipsum/i, /\btab (one|two)\b/i, /under construction/i];
const uiFiles = [
  ...walk(join(ROOT, 'src/app'), ['.tsx']),
  ...walk(join(ROOT, 'src/features'), ['.tsx']),
];
for (const file of uiFiles) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const re of JUNK) {
        if (re.test(line))
          add(
            'P1',
            'STORE-APL-2.1-COMPLETE',
            `${file}:${i + 1} placeholder copy: "${line.trim().slice(0, 60)}"`,
          );
      }
    });
}

// 2) Template identity must be replaced before submission (STORE-IDENTITY / 4.3).
const appConfig = existsSync(join(ROOT, 'app.config.ts'))
  ? readFileSync(join(ROOT, 'app.config.ts'), 'utf8')
  : '';
const identityLeftovers = [
  ['com.yourcompany', 'placeholder bundle id / package (com.yourcompany.*)'],
  ["slug: 'expo-skeleton'", "placeholder slug 'expo-skeleton'"],
  ["scheme: 'skeleton'", "placeholder scheme 'skeleton'"],
];
for (const [needle, label] of identityLeftovers) {
  if (appConfig.includes(needle))
    add('P1', 'STORE-IDENTITY', `app.config.ts still has ${label} — brand the app first`);
}
const envExample = existsSync(join(ROOT, '.env.example'))
  ? readFileSync(join(ROOT, '.env.example'), 'utf8')
  : '';
if (envExample.includes('api.example.com'))
  add('P3', 'STORE-IDENTITY', '.env.example still points to api.example.com (set a real API base)');

// 3) In-app account deletion path must exist (STORE-ACCT-DELETE).
if (!existsSync(join(ROOT, 'src/app/account.tsx')))
  add(
    'P1',
    'STORE-ACCT-DELETE',
    'no /account route (src/app/account.tsx) — Apple 5.1.1(v)/Google require in-app deletion',
  );
if (!existsSync(join(ROOT, 'supabase/functions/delete-account/index.ts')))
  add(
    'P1',
    'STORE-ACCT-DELETE',
    'no delete-account Edge Function — the deletion must remove the account + data',
  );

// 4) iOS privacy manifest present (STORE-APL-PRIVMANIFEST) + encryption answered.
if (!/privacyManifests/.test(appConfig) || !/NSPrivacyAccessedAPITypes/.test(appConfig))
  add(
    'P1',
    'STORE-APL-PRIVMANIFEST',
    'app.config.ts has no ios.privacyManifests — App Store Connect rejects uploads missing required-reason declarations',
  );
if (!/usesNonExemptEncryption/.test(appConfig))
  add('P2', 'STORE-APL-EXPORT', 'app.config.ts does not answer ios.config.usesNonExemptEncryption');

// 5) Android target API level (STORE-GP-TARGETAPI).
const target = appConfig.match(/targetSdkVersion:\s*(\d+)/);
if (!target)
  add(
    'P1',
    'STORE-GP-TARGETAPI',
    'no targetSdkVersion set (expo-build-properties) — Play requires API 35+',
  );
else if (Number(target[1]) < 35)
  add(
    'P1',
    'STORE-GP-TARGETAPI',
    `targetSdkVersion ${target[1]} < 35 (Play minimum since 2025-08-31)`,
  );

// Report
const p1 = findings.filter((f) => f.sev === 'P1');
if (findings.length === 0) {
  console.log('check-store-readiness ✓ no automated store-readiness blockers');
  console.log(
    'Remember the manual gate: docs/store/checklist.md (demo account, IAP/Restore, metadata, 4.3 originality, privacy labels).',
  );
  process.exit(0);
}
console.error(`\ncheck-store-readiness found ${findings.length} item(s) (${p1.length} P1):\n`);
for (const f of findings)
  console.error(`  ${f.sev === 'P1' ? '✗' : '•'} [${f.sev}] ${f.id} — ${f.msg}`);
console.error(
  '\nP1 = will be rejected. Fix before submitting. Full catalog: docs/store/checklist.md',
);
console.error(
  'Then complete the MANUAL checks (demo account, IAP/Restore, metadata, 4.3 originality, privacy labels).\n',
);
process.exit(p1.length > 0 ? 1 : 0);
