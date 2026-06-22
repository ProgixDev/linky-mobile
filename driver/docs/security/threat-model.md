---
id: security-threat-model
read-when: Designing or reviewing anything that touches auth, storage, secrets, deep links, network, or payments. Read before adding a backend (Phase 2).
owns: The threat model — assets, trust boundaries, attacker classes, data classification — for apps built from this skeleton.
---

# Threat model

Apps built from this skeleton ship with auth, payments/subscriptions, and sensitive
personal data. We assume a motivated attacker with a rooted/jailbroken device, the
ability to inspect network traffic and the app bundle, and access to leaked/stolen
device backups. Evidence: [`docs/research/01-mobile-security.md`](../research/01-mobile-security.md),
[`docs/research/03-supabase-security.md`](../research/03-supabase-security.md).

## Core principle

**The client is hostile territory.** Anything in the bundle (keys, logic, "hidden"
endpoints) is extractable; any client-side check can be bypassed with Frida. On-device
controls (SecureStore, pinning, RASP) raise attacker cost — they are defense-in-depth.
The real security boundary is the **server**: Supabase RLS, server-side session
validation, and server-verified attestation. Design every feature so that a fully
compromised client still cannot read or write data it shouldn't.

## Assets (what we protect)

1. **User credentials & sessions** — passwords, access/refresh tokens, OAuth codes.
2. **Personal data (PII)** — anything identifying a user; subject to store privacy rules.
3. **Payment / entitlement state** — subscription status, purchase receipts.
4. **Backend integrity** — the database and its access rules (RLS).
5. **App integrity & reputation** — not shipping a tampered/cloned/leaky build.

## Trust boundaries

- **Device ↔ app process** — other apps, the OS, a rooted user. Mitigations: SecureStore,
  screen-capture protection, (optional) RASP/attestation.
- **App ↔ network** — MITM, traffic inspection. Mitigations: TLS-only, (optional) pinning.
- **App ↔ backend** — the app is an untrusted client. Mitigations: **RLS**, server-side
  validation, signature-verified webhooks, attestation for high-value actions.
- **Inbound deep/universal links** — untrusted input from email/web/other apps.
  Mitigations: allowlist gate (`src/shared/lib/deep-link.ts`), never trust params for authz.
- **Supply chain** — npm dependencies. Mitigations: lockfile, `npx expo install`, audit/scan.

## Data classification (drives where it may live)

| Class                   | Examples                                          | Where it may be stored                                                                                             |
| ----------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Secret**              | tokens, refresh tokens, API keys handed to us     | `secureStorage` / `LargeSecureStore` only; never logs/bundle                                                       |
| **Sensitive (PII)**     | email, phone, health, finance, location           | server (RLS-scoped); on device only if necessary + in secure storage; split sensitive columns into their own table |
| **Public-config**       | `EXPO_PUBLIC_*`, anon/publishable keys, base URLs | bundle is fine (they are public by design)                                                                         |
| **Non-sensitive state** | UI prefs, caches, task lists                      | `appStorage` (plaintext AsyncStorage) is fine                                                                      |

## Attacker classes & primary mitigations

- **Opportunistic data scraper** (hits your Supabase REST endpoint with the public anon
  key) → **RLS deny-by-default on every table** is the entire defense (Phase 2). This is
  the single most common real-world breach for apps like ours (CVE-2025-48757).
- **Device thief / forensic** (reads disk, restores a backup) → secrets only in
  Keychain/Keystore with `deviceOnly`; nothing sensitive in AsyncStorage/logs.
- **Network MITM** → TLS-only; optional SPKI pinning for regulated apps.
- **App tamperer / cloner** (repackages your app) → optional RASP + server-verified
  attestation; per-app differentiation (also a store-review concern, Phase 3).
- **Malicious dependency** → lockfile + quarantine + behavioral scanning.

## Out of scope (accepted)

- A determined attacker reverse-engineering client logic — assumed possible; mitigated by
  keeping nothing security-critical on the client.
- Physical device compromise while unlocked and in the user's hands.

See the enforceable controls in [`checklist.md`](checklist.md).
