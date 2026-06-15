#!/usr/bin/env node
// Phase I.6 — read a translator-filled linky-translations.csv back into
// pular.json + sousou.json. Untouched cells keep the French fallback
// (handled by i18next's fallbackLng:'fr' at runtime).
//
// Validates against fr.json: any key in the CSV that doesn't exist in
// fr.json is reported and skipped. Any key in fr.json missing from the CSV
// is reported too (translator working from an older export).
//
// Usage:
//   node scripts/i18n-import-csv.mjs [path-to-csv]
// Defaults to linky-mobile/linky-translations.csv (the repo root).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const localesDir = join(here, '..', 'src', 'i18n', 'locales');
const defaultCsv = join(here, '..', '..', 'linky-translations.csv');
const csvPath = process.argv[2] || defaultCsv;

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

// Minimal CSV parser that honors quoted fields and "" escapes, and accepts
// CR LF or LF line endings. Strips an optional UTF-8 BOM.
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\r') {
      // ignore -- the LF closes the row
    } else if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += c;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const raw = readFileSync(csvPath, 'utf8');
const records = parseCsv(raw);
const header = records.shift();
if (!header || header[0] !== 'key') {
  console.error(`Expected first column "key", got: ${JSON.stringify(header)}`);
  process.exit(1);
}
// Find column indexes by header name so the script tolerates added/reordered
// columns (e.g. a translator note column).
const idx = (name) => header.findIndex((h) => h.trim().toLowerCase() === name);
const iKey = idx('key');
const iPular = idx('pular');
const iSousou = idx('sousou');
if (iKey < 0 || iPular < 0 || iSousou < 0) {
  console.error(`Missing column. Need key, pular, sousou. Header: ${JSON.stringify(header)}`);
  process.exit(1);
}

const fr = loadJson('fr.json');
const frPaths = new Set();
const frValues = new Map();
for (const { path, value } of leaves(fr)) {
  frPaths.add(path);
  frValues.set(path, value);
}

const newPular = {};
const newSousou = {};
const csvPaths = new Set();
let pularSet = 0;
let sousouSet = 0;
let unknownKeys = 0;

for (const rec of records) {
  const path = (rec[iKey] || '').trim();
  if (!path) continue;
  if (!frPaths.has(path)) {
    console.warn(`  skip unknown key (not in fr.json): ${path}`);
    unknownKeys++;
    continue;
  }
  csvPaths.add(path);
  const frVal = frValues.get(path);
  const pVal = (rec[iPular] || '').trim();
  const sVal = (rec[iSousou] || '').trim();
  // Empty cell -> keep the French placeholder so fallbackLng:'fr' renders
  // clean French at runtime.
  setAt(newPular, path, pVal !== '' ? pVal : frVal);
  setAt(newSousou, path, sVal !== '' ? sVal : frVal);
  if (pVal !== '' && pVal !== frVal) pularSet++;
  if (sVal !== '' && sVal !== frVal) sousouSet++;
}

// Walk fr to add any keys the translator's CSV didn't cover (stale export).
let backfilled = 0;
for (const { path, value } of leaves(fr)) {
  if (csvPaths.has(path)) continue;
  setAt(newPular, path, value);
  setAt(newSousou, path, value);
  backfilled++;
}

writeFileSync(join(localesDir, 'pular.json'), JSON.stringify(newPular, null, 2) + '\n', 'utf8');
writeFileSync(join(localesDir, 'sousou.json'), JSON.stringify(newSousou, null, 2) + '\n', 'utf8');

console.log(`Imported ${csvPath}`);
console.log(`  ${frPaths.size} key(s) in fr.json`);
console.log(`  pular: ${pularSet} translated, ${frPaths.size - pularSet} remain French`);
console.log(`  sousou: ${sousouSet} translated, ${frPaths.size - sousouSet} remain French`);
if (backfilled > 0) {
  console.log(`  ${backfilled} key(s) backfilled from fr.json (CSV is stale -- re-export to refresh)`);
}
if (unknownKeys > 0) {
  console.log(`  ${unknownKeys} unknown key(s) in CSV skipped (translator working from stale export?)`);
}
