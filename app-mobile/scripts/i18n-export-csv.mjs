#!/usr/bin/env node
// Phase I.6 — export the four locale JSONs to a single translator-friendly
// CSV at the linky-mobile repo root: linky-translations.csv
//
// Columns: key, francais, english, pular, sousou
//   - key     : the dotted leaf path (e.g. "settings.languageTitle")
//   - francais: fr.json value (always filled)
//   - english : en.json value (always filled, drafted by the engineer)
//   - pular   : pular.json value IF a translator has already provided one
//               (i.e. it differs from the French source string), otherwise
//               LEFT EMPTY so the translator sees what they need to fill.
//   - sousou  : same rule as pular.
//
// Output is UTF-8 *with BOM* so Excel auto-detects the encoding and
// displays accents correctly. This is the same CP1252 mojibake class we
// chased down in Phase Y.1 — keep the BOM.
//
// Round-trip: scripts/i18n-import-csv.mjs reads this CSV back and writes
// pular.json + sousou.json with whatever the translators filled. See
// linky-mobile/PHASE_I18N_HANDOFF.md.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const localesDir = join(here, '..', 'src', 'i18n', 'locales');
// Output at linky-mobile/ (the git repo root), one level above app-mobile.
const outPath = join(here, '..', '..', 'linky-translations.csv');

function loadJson(file) {
  return JSON.parse(readFileSync(join(localesDir, file), 'utf8'));
}

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

function valueAt(obj, path) {
  return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

// CSV escape: wrap in quotes if the cell contains comma, quote, newline, or
// starts/ends with whitespace. Double any internal quotes.
function csvCell(v) {
  const s = v == null ? '' : String(v);
  const needsQuote = /[",\r\n]/.test(s) || /^\s|\s$/.test(s);
  if (!needsQuote) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

const fr = loadJson('fr.json');
const en = loadJson('en.json');
const pular = loadJson('pular.json');
const sousou = loadJson('sousou.json');

const rows = ['key,francais,english,pular,sousou'];
let total = 0;
let pularFilled = 0;
let sousouFilled = 0;

for (const { path, value: frVal } of leaves(fr)) {
  total++;
  const enVal = valueAt(en, path) ?? '';
  const pVal = valueAt(pular, path);
  const sVal = valueAt(sousou, path);
  // A pular/sousou cell is considered "filled" only if it differs from the
  // French source string — i.e. a translator has actually replaced it.
  const pularCell = typeof pVal === 'string' && pVal !== frVal ? pVal : '';
  const sousouCell = typeof sVal === 'string' && sVal !== frVal ? sVal : '';
  if (pularCell) pularFilled++;
  if (sousouCell) sousouFilled++;
  rows.push(
    [
      csvCell(path),
      csvCell(frVal),
      csvCell(enVal),
      csvCell(pularCell),
      csvCell(sousouCell),
    ].join(','),
  );
}

// BOM + CRLF line endings so Excel on Windows opens it cleanly.
const csv = '﻿' + rows.join('\r\n') + '\r\n';
writeFileSync(outPath, csv, 'utf8');

console.log(`Wrote ${outPath}`);
console.log(`  ${total} key(s)`);
console.log(`  pular: ${pularFilled} filled, ${total - pularFilled} empty`);
console.log(`  sousou: ${sousouFilled} filled, ${total - sousouFilled} empty`);
