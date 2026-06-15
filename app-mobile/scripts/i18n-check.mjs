#!/usr/bin/env node
// Phase I.2 — assert the four locale JSONs have identical key sets, so no
// language ever drifts. fr.json is the source of truth. Optional --mirror
// flag rewrites pular.json + sousou.json from fr.json (French placeholders)
// while preserving any value that already differs from the French source —
// useful after adding a batch of keys.
//
// Run modes:
//   node scripts/i18n-check.mjs            # assert ; non-zero on drift
//   node scripts/i18n-check.mjs --mirror   # add missing keys to pular+sousou
//                                          # (drops keys that don't exist in fr)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const localesDir = join(here, '..', 'src', 'i18n', 'locales');

function loadJson(file) {
  const path = join(localesDir, file);
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Recursively walk an object and yield every leaf as { path, value }. Arrays
// are treated as opaque leaves (we don't have any in our locale schema).
function* leaves(obj, prefix = '') {
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      yield* leaves(v, p);
    } else {
      yield { path: p, value: v };
    }
  }
}

function keyPaths(obj) {
  const s = new Set();
  for (const { path } of leaves(obj)) s.add(path);
  return s;
}

function setAt(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}

function valueAt(obj, path) {
  return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

function dropAt(obj, path) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (typeof cur[k] !== 'object' || cur[k] === null) return;
    cur = cur[k];
  }
  delete cur[parts[parts.length - 1]];
}

const mirror = process.argv.includes('--mirror');
// --en-coverage adds a second pass that flags every en.json value byte-
// identical to its fr.json counterpart, EXCEPT for an allow-list of cells
// that are legitimately the same in both languages (brand names, currency
// codes, proper nouns, short alphanumeric tokens). Phase I.8 — guard against
// EN cells silently leaking French copy.
const enCoverage = process.argv.includes('--en-coverage');

const fr = loadJson('fr.json');
const en = loadJson('en.json');
const pular = loadJson('pular.json');
const sousou = loadJson('sousou.json');

// Keys whose FR and EN values are EXPECTED to be byte-identical (no
// translation needed). Add new entries here when they're a real cross-
// language constant, not a missed translation.
const EN_FR_IDENTICAL_ALLOWLIST = new Set([
  'common.ok',
  'currency.gnf',
  'currency.eur',
  'languages.fr',
  'languages.en',
  'languages.pular',
  'languages.sousou',
  'onboarding.phone.placeholder',
  'onboarding.phone.badge',
  'onboarding.email.badge',
  // Pure interpolation template, no translatable words.
  'cart.subtitle',
  'pro.demandeWhenOther',
  'order.stageCarrierSuffix',
  // Pure interpolation templates — only the {{var}} differs FR/EN.
  'create.fieldDescCount',
  'create.fieldEur',
  // "Auto & Moto" is identical brand-style French/English.
  'create.catAutoMoto',
  // "{{count}} active" happens to be valid English and French both.
  'proDashboard.statActive_one',
  'checkout.confirmTerminalErrorPrefix',
  // Brand / section header ("Mobile Money" stays as-is across FR/EN).
  'checkout.sectionMobileMoney',
  'checkout.cardSub',
  // Brand names (mobile money rails + card schemes + payment buttons +
  // local Guinea delivery partners).
  'checkout.rails.orangeMoney',
  'checkout.rails.mtnMoney',
  'checkoutSub.cardHint',
  'checkoutSub.applePay',
  'checkoutSub.googlePay',
  'seller.shipCarrierJefaLabel',
  'seller.shipCarrierSopexLabel',
  // Carrier-supplied tracking format placeholder.
  'seller.shipTrackingPlaceholder',
  // Technical brand (Wi-Fi is the registered alliance trademark).
  'create.amenityWifi',
  // Pure interpolation template, identical structure FR/EN.
  'aboutScreen.version',
  // Brand handles / domains / email addresses are language-agnostic.
  'aboutScreen.instagramSub',
  'aboutScreen.websiteSub',
  'aboutScreen.writeSub',
  'helpScreen.emailSub',
]);

function looksLikeProperNoun(value) {
  // Heuristic : single-token, capitalized, no whitespace = brand / proper
  // noun (e.g. "Linky"). Allow through silently.
  return typeof value === 'string' && /^[A-Z][A-Za-z0-9]+$/.test(value.trim());
}

const frKeys = keyPaths(fr);

let drift = 0;
for (const [name, bag] of [
  ['en', en],
  ['pular', pular],
  ['sousou', sousou],
]) {
  const bagKeys = keyPaths(bag);
  const missing = [...frKeys].filter((k) => !bagKeys.has(k));
  const extra = [...bagKeys].filter((k) => !frKeys.has(k));
  if (missing.length || extra.length) {
    console.log(`\n[${name}] drift detected:`);
    if (missing.length) {
      console.log(`  ${missing.length} missing key(s):`);
      for (const k of missing.slice(0, 20)) console.log(`    - ${k}`);
      if (missing.length > 20) console.log(`    … (+${missing.length - 20} more)`);
    }
    if (extra.length) {
      console.log(`  ${extra.length} extra key(s) not in fr:`);
      for (const k of extra.slice(0, 20)) console.log(`    - ${k}`);
      if (extra.length > 20) console.log(`    … (+${extra.length - 20} more)`);
    }
    drift += missing.length + extra.length;
  }
}

if (mirror) {
  // Rewrite pular + sousou from fr, preserving any value that differs from
  // the French source (i.e. anything a translator has already filled in).
  for (const [name, bag] of [
    ['pular.json', pular],
    ['sousou.json', sousou],
  ]) {
    const out = {};
    for (const { path, value: frVal } of leaves(fr)) {
      const cur = valueAt(bag, path);
      // Only preserve translator overrides: a value that exists AND differs
      // from the French source string.
      if (typeof cur === 'string' && cur !== frVal) {
        setAt(out, path, cur);
      } else {
        setAt(out, path, frVal);
      }
    }
    writeFileSync(join(localesDir, name), JSON.stringify(out, null, 2) + '\n', 'utf8');
    console.log(`[${name}] mirrored from fr.json (${[...keyPaths(out)].length} keys)`);
  }
  console.log('\nMirror complete. Re-run without --mirror to verify.');
  process.exit(0);
}

if (drift > 0) {
  console.log(`\nKey drift: ${drift} difference(s). Run with --mirror to sync pular+sousou from fr.`);
  process.exit(1);
}

const total = frKeys.size;
console.log(`fr.json: ${total} keys`);
console.log(`en.json: ${keyPaths(en).size} keys`);
console.log(`pular.json: ${keyPaths(pular).size} keys`);
console.log(`sousou.json: ${keyPaths(sousou).size} keys`);
console.log('All four locale files are key-aligned.');

// Phase I.8 — second assertion : every en.json value differs from its
// fr.json counterpart, unless the key is in EN_FR_IDENTICAL_ALLOWLIST or
// looks like a proper noun. Without this, an EN cell silently carrying the
// French source string ships untranslated.
if (enCoverage) {
  console.log('\n=== EN coverage check ===');
  const suspect = [];
  for (const { path, value: frVal } of leaves(fr)) {
    const enVal = valueAt(en, path);
    if (typeof enVal !== 'string') continue;
    if (enVal !== frVal) continue;
    if (EN_FR_IDENTICAL_ALLOWLIST.has(path)) continue;
    if (looksLikeProperNoun(frVal)) continue;
    suspect.push({ path, value: frVal });
  }
  if (suspect.length === 0) {
    console.log(`OK -- every en.json value differs from fr.json (or is allowlisted).`);
  } else {
    console.log(`${suspect.length} en.json value(s) identical to fr.json (likely missing translation):`);
    for (const s of suspect.slice(0, 30)) {
      console.log(`  - ${s.path}  =  ${JSON.stringify(s.value)}`);
    }
    if (suspect.length > 30) console.log(`  … (+${suspect.length - 30} more)`);
    process.exit(1);
  }
}
