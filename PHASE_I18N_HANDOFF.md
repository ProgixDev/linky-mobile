# Linky — translator handoff (Pular & Sousou)

The app supports four languages: **Français** (source of truth), **English**
(engineer-drafted, client reviewable), **Pular**, **Sousou**. Pular and Sousou
have no machine-translation worth using, so the engineering team can't draft
them — the client's human translators do, via a single CSV per round-trip.

Translators **never edit JSON.** They edit a spreadsheet. Period.

## The round-trip

```
fr.json + en.json + pular.json + sousou.json
        │
        ▼ scripts/i18n-export-csv.mjs
linky-translations.csv  ───────►  send to translator
                                          │
                                          ▼
                            translator fills the pular/sousou columns
                                          │
                          send back the filled CSV (UTF-8, NOT CP1252)
                                          ▼
                          scripts/i18n-import-csv.mjs
                                          │
                                          ▼
                              updated pular.json + sousou.json
                                          │
                                          ▼
                          git commit + app rebuild
```

## Commands

From `app-mobile/`:

```sh
# Generate the translator spreadsheet (one row per key)
node scripts/i18n-export-csv.mjs
# Output: linky-mobile/linky-translations.csv

# After the translator returns the filled CSV, write pular.json + sousou.json
node scripts/i18n-import-csv.mjs
# Reads:  linky-mobile/linky-translations.csv (or pass a path as $1)
# Writes: src/i18n/locales/{pular,sousou}.json

# Sanity check the four locale JSONs are key-aligned
node scripts/i18n-check.mjs

# Re-mirror missing keys in pular+sousou from fr (after adding new keys)
node scripts/i18n-check.mjs --mirror
```

## CSV layout (`linky-translations.csv`)

| Column     | Filled by              | Notes                                              |
|------------|------------------------|----------------------------------------------------|
| `key`      | system                 | Stable dotted path. **Never edit.** Used to match. |
| `francais` | system (from fr.json)  | Reference for the translator. Read-only.           |
| `english`  | system (from en.json)  | Reference for the translator. Read-only.           |
| `pular`    | translator             | Translation in Pular. Leave empty for "use French".|
| `sousou`   | translator             | Translation in Sousou. Leave empty for "use French".|

- The file is **UTF-8 with BOM** so Excel opens accents (é, à, ô, …) correctly.
- One row per leaf string. Plural variants appear as separate rows
  (`shop.articles_one`, `shop.articles_other`, …).
- An **empty** `pular` or `sousou` cell means "show the French source" —
  that's a safe default and what the app already does today.

## Sending it to a translator (the brief)

> Open `linky-translations.csv` in Excel (or Google Sheets — File → Import →
> Upload, set delimiter to "comma" and encoding to "UTF-8"). For each row,
> read the `francais` column (or `english` if you prefer) and write the
> equivalent in the `pular` (or `sousou`) column. Do **not** edit `key`,
> `francais`, or `english`. Leave a cell empty if the row doesn't apply or
> you don't know it yet — the app will show French.
>
> When done: **File → Save As → CSV UTF-8** (NOT plain CSV / Windows-1252 /
> CP1252). Accents WILL break if saved as anything other than UTF-8 — we've
> already chased that exact bug once (see PHASE_K_V1_1_BACKLOG.md
> "mojibake"); please double-check on save.
>
> Send the file back as-is — same name, same column order.

## After receiving the filled CSV

```sh
# 1. Drop the returned CSV at linky-mobile/linky-translations.csv
# 2. Apply it:
cd app-mobile
node scripts/i18n-import-csv.mjs

# 3. Sanity:
node scripts/i18n-check.mjs
npm run typecheck

# 4. Commit:
git add src/i18n/locales/pular.json src/i18n/locales/sousou.json linky-translations.csv
git commit -F .git-commit-msg.tmp
```

## When fr.json gains new keys (engineer side)

```sh
# Mirror them into pular + sousou as French placeholders so nothing drifts:
node scripts/i18n-check.mjs --mirror

# Re-export the CSV so the next round-trip includes the new keys:
node scripts/i18n-export-csv.mjs
```

The exported CSV preserves any pular/sousou values the translator already
filled — only blanks where a key has never been translated. Send the
updated CSV; the translator only fills the new rows.

## Why English is engineer-drafted (not a translator round-trip)

English is reasonable to draft from French context and the client speaks
enough English to spot-check it. Pular and Sousou don't have that fallback —
human translators are the only path.
