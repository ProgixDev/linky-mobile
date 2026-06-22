# Security

This skeleton treats **the client as hostile territory**: everything shipped to a
device is extractable, so on-device controls are defense-in-depth and the real
boundary is the server (Supabase RLS, server-side validation, attestation). This
file is the coverage map; the enforceable rules live in
[`docs/security/checklist.md`](docs/security/checklist.md) and the rationale in
[`docs/security/threat-model.md`](docs/security/threat-model.md). Evidence and
sources: [`docs/research/01-mobile-security.md`](docs/research/01-mobile-security.md).

## Reporting

Report vulnerabilities privately to **security@yourcompany.com** (TODO: set the real
contact). Do not open public issues for security reports.

## MASVS coverage matrix

Mapped to [OWASP MASVS](https://mas.owasp.org/MASVS/). "Enforced by" names the
mechanism that makes the control hard to violate — a lint rule, a test, a gate, or a
documented build step. `[x]` baked in · `[~]` partial / Phase 2+ · `[ ]` not yet.

| MASVS         | Control                                 | Status | How it's enforced in this repo                                                                                                                                        |
| ------------- | --------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| STORAGE-1     | No secrets in plaintext storage         | `[x]`  | `src/shared/lib/storage` three-tier wrapper; ESLint bans direct `AsyncStorage`/`expo-secure-store`/`mmkv`                                                             |
| STORAGE-1     | Large secrets encrypted at rest         | `[x]`  | `LargeSecureStore` (AES + Keychain) for >2KB blobs (Supabase session, Phase 2)                                                                                        |
| STORAGE-2     | Secrets excluded from backups           | `[~]`  | SecureStore `deviceOnly` option + Android backup exclusion (config step, Phase 2 wiring)                                                                              |
| CRYPTO-1/2    | No hardcoded keys; platform crypto      | `[x]`  | `scripts/check-secrets.mjs` + gitleaks; `crypto.getRandomValues`                                                                                                      |
| AUTH-1/2/3    | Server-validated sessions; PKCE; RLS    | `[x]`  | Supabase PKCE client + `LargeSecureStore` session; **RLS deny-by-default** migrations + auto-enable trigger; pgTAP tests _(MFA-in-RLS + leaked-password = follow-up)_ |
| NETWORK-1     | Enforce TLS / block cleartext           | `[~]`  | Phase 1 config plugin (ATS on, Android cleartext off) — pending                                                                                                       |
| NETWORK-2     | Cert pinning (optional)                 | `[ ]`  | Nice-to-have, toggleable (Phase 1 backlog)                                                                                                                            |
| PLATFORM-1    | Deep links validated, no open redirect  | `[x]`  | `src/shared/lib/deep-link.ts` allowlist + `src/app/+native-intent.tsx` gate; tests                                                                                    |
| PLATFORM-2    | No untrusted WebView / embedded auth    | `[~]`  | System-browser OAuth in Phase 2; no `react-native-webview` for auth (policy)                                                                                          |
| CODE-1        | Validate all input at the edges         | `[x]`  | Zod schemas in `features/*/model/schema.ts` (hard rule, AGENTS.md)                                                                                                    |
| CODE-2        | No secrets in source/bundle             | `[x]`  | `check-secrets` in `verify` + pre-commit; build-time `dist/` scan                                                                                                     |
| CODE-3        | Supply-chain hygiene                    | `[~]`  | Committed lockfile; `npx expo install`; `npm audit` (Socket/minimumReleaseAge pending)                                                                                |
| CODE-4        | No sensitive data in logs               | `[x]`  | `src/shared/lib/logger.ts` redacts tokens/PII/JWTs                                                                                                                    |
| RESILIENCE-\* | Anti-tamper / RASP / attestation        | `[ ]`  | Strongly-recommended, dev-build only (`@expo/app-integrity`, freeRASP) — Phase 1 backlog                                                                              |
| PRIVACY       | Minimize PII; screen-capture protection | `[~]`  | `expo-screen-capture` on sensitive screens (Phase 1 backlog); store/privacy work in Phase 3                                                                           |

## Non-negotiables (the short version)

- **No secrets in the repo or the JS bundle.** `EXPO_PUBLIC_*` is plaintext-public by
  definition; real secrets live server-side (EAS secrets / Supabase Edge Functions).
- **All persistence goes through `@/shared/lib/storage`** — secrets to `secureStorage` /
  `LargeSecureStore`, never to `appStorage`.
- **Validate every input** (user, storage rehydration, network, deep-link param) with Zod.
- **Never trust the client for authorization** — Supabase RLS is the boundary (Phase 2).
- **Treat AI-written code like a junior dev's PR**: run `/security-review` (Phase 6) before merge.

## Local enforcement (no cloud CI — ADR-0008)

`npm run verify` runs the full gate locally (format, lint, typecheck, test, docs, secrets).
Pre-commit hooks run `lint-staged` + `check-secrets` (+ gitleaks if installed). Install the
optional deep scanner with `brew install gitleaks`; run it with `npm run secrets:scan`.
