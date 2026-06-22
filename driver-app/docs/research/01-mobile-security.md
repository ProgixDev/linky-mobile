---
id: research-mobile-security
read-when: Implementing Phase 1 (security foundation) — secure storage, secrets, transport, runtime integrity, supply chain, local enforcement.
owns: Verified 2025-2026 Expo/RN security patterns + the prioritized "bake into skeleton" list.
---

# Mobile Security for Expo / React Native (SDK 53–56) — 2025–2026

**Governing principle:** the client is hostile territory. Every client-side control below is
defense-in-depth that raises attacker cost; the real boundary is the server (RLS, server-side
session validation, server-verified attestation).

## 1. Secure storage (three-tier model)

- `expo-secure-store` → all secrets/tokens. iOS Keychain / Android EncryptedSharedPreferences + Keystore (hardware-backed where available). Managed-workflow compatible. ([Expo](https://docs.expo.dev/versions/latest/sdk/securestore/))
- `react-native-mmkv` (encrypted) → fast app state/caches; **generate the MMKV key at runtime and seal it in SecureStore**, never hardcode. Needs a dev build. ([mmkv](https://github.com/mrousavy/react-native-mmkv))
- AsyncStorage → **plaintext**. Non-sensitive state only. NEVER tokens, refresh tokens, API keys, PII, payment data. ([RN security](https://reactnative.dev/docs/security), [MASTG-TEST-0001](https://mas.owasp.org/MASTG/tests/android/MASVS-STORAGE/MASTG-TEST-0001/))
- **Keychain accessibility:** default `WHEN_UNLOCKED`; use `*_THIS_DEVICE_ONLY` for high-sensitivity (not migrated via iCloud backup restore). `ALWAYS` deprecated.
- **Biometric-gated secrets:** `requireAuthentication: true` (Face ID/Touch ID). Entries invalidated when biometrics change → always provide re-login recovery. Not in Expo Go.
- **The ~2KB gotcha (load-bearing):** iOS Keychain rejects values >~2048 bytes; a Supabase session blob exceeds it. Fix with a **chunked adapter** or **encrypt-then-AsyncStorage** (256-bit key in SecureStore, AES-encrypt session into AsyncStorage). See Supabase `LargeSecureStore`. ([Supabase RN auth](https://supabase.com/blog/react-native-authentication))
- iOS Keychain **survives uninstall** → explicitly `deleteItemAsync` on logout. Set `ios.config.usesNonExemptEncryption: false`.

## 2. Secrets & env

- **Bundled keys ARE extractable.** Hermes bytecode is decompilable (`hermes-dec`); hardcoded keys are recoverable. Treat the bundle as public. ([hermes-dec](https://github.com/P1sec/hermes-dec))
- `EXPO_PUBLIC_*` is inlined as plaintext — **public by design**. Non-sensitive config only. ([Expo env](https://docs.expo.dev/guides/environment-variables/))
- EAS env vars (plain/sensitive/**secret**) protect **build-time only**; a secret referenced in client code still lands in the bundle. ([EAS env](https://docs.expo.dev/eas/environment-variables/))
- **Can live on device:** Supabase anon/publishable key, Stripe publishable (`pk_`), RevenueCat public SDK key. **Never on device:** Supabase service*role, Stripe secret (`sk*`), any third-party secret key, JWT signing secrets.
- **BFF/proxy pattern** for any third-party secret key: client → your Edge Function/route (holds secret) → third party.

## 3. Transport

- Re-enable ATS / block cleartext for production: `ios.infoPlist` ATS `false`→ actually set `NSAllowsArbitraryLoads:false`; Android `usesCleartextTraffic` off + `network_security_config.xml`. Use a **config plugin** in managed workflow.
- **Cert pinning:** `react-native-ssl-public-key-pinning` (SPKI SHA-256, OkHttp/TrustKit, no native code). Needs a dev build, never Expo Go. **≥2 pins per domain**, push pin updates **OTA via expo-updates**, make it **toggleable**. JS-layer pinning is bypassable via Frida — defense-in-depth only; real guarantee is attestation. ([lib](https://github.com/frw/react-native-ssl-public-key-pinning), [OWASP pinning](https://cheatsheetseries.owasp.org/cheatsheets/Pinning_Cheat_Sheet.html))

## 4. Runtime / app integrity (MASVS-RESILIENCE)

- Hermes is **not** obfuscation. Free obfuscation: `react-native-obfuscating-transformer`; commercial: Jscrambler. Obfuscate pinning/integrity routines specifically.
- **RASP — freeRASP (Talsec)** is the recommended Expo-compatible layer: root/jailbreak/debugger/emulator/tamper/repackaging/hook(Frida)/screen-capture detection. Official Expo config plugin, dev build required. Wire callbacks to **graduated responses** (log → warn → block sensitive action), never a blanket kill. Lightweight free alt: `jail-monkey` (v3.x for new arch). ([freeRASP](https://github.com/talsec/Free-RASP-ReactNative))

## 5. Auth/session security

- `flowType:'pkce'`, `persistSession:true`, `autoRefreshToken:true`, `detectSessionInUrl:false`, SecureStore-backed adapter.
- **PKCE mandatory** for mobile (RFC 8252). Use the **system browser** (`expo-web-browser` `openAuthSessionAsync`), **never an embedded WebView**.
- **Advanced:** PKCE alone doesn't stop the ASWebAuthenticationSession custom-scheme account-takeover — **use a verified Universal/App Link as the OAuth redirect URI (not a custom scheme) + server-side consent**. ([evanconnelly.com](https://evanconnelly.com/post/ios-oauth/))
- Redact tokens from every logger + Sentry `beforeSend`. `expo-screen-capture` on PII/payment screens. On logout: `signOut()` + `deleteItemAsync`.

## 6. Deep link / universal link security

- Custom schemes are hijackable → anything carrying tokens/codes must ride a **verified App Link / Universal Link** (cryptographically domain-bound, managed-workflow compatible). With EAS-managed signing, publish **all** SHA-256 fingerprints in `assetlinks.json`.
- **Never trust deep-link params.** In `+native-intent.tsx` `redirectSystemPath`: parse in try/catch, **allowlist host + resolved route**, redirect unknown → safe error screen, never trust param IDs for authz (RLS enforces ownership). Validate scheme=https + host∈allowlist before any `openURL`/WebBrowser. Tighten Supabase Redirect URL allowlist.

## 7. OWASP MASVS mapping

Structure `SECURITY.md` as a coverage matrix: MASVS control ID + Mobile-Top-10 + baked-in mitigation + MASTG test page. Categories: STORAGE, CRYPTO, AUTH, NETWORK, PLATFORM, CODE, RESILIENCE, PRIVACY. ([MASVS](https://mas.owasp.org/MASVS/))

## 8. Supply chain (now the dominant vector)

- 2024-2025 incidents: Shai-Hulud worm (500+ packages), chalk/debug (2.6B weekly downloads), RN-specific malicious packages.
- Commit the lockfile; install with `--frozen-lockfile` / `npm ci`. pnpm 11.x `minimumReleaseAge` (~1 day quarantine — defeats instant-republish worms), `ignore-scripts`. Use `npx expo install` for native deps.
- Audit: `pnpm audit` (CVE-first) + **Socket.dev** (behavioral — flags install-script network calls, typosquats before a CVE exists).

## 9. Local CI-free enforcement

- **Hook runner: Lefthook** (single Go binary, parallel; Husky+lint-staged is the fallback you already have).
- ESLint: `@typescript-eslint` + `eslint-plugin-security` + `eslint-plugin-react-native` + `eslint-plugin-no-secrets`.
- Secret scanners: **gitleaks** (pre-commit, offline) + TruffleHog (periodic deep scan).
- SAST: **Semgrep** (`p/react p/typescript p/javascript p/mobsfscan`) pre-push; **MobSF** scan of the built APK/IPA at release.
- Wiring: pre-commit → gitleaks + ESLint(staged) + typecheck; pre-push → Semgrep + `pnpm audit` + Socket; release → MobSF + `hermes-dec` secret-string check.

## 10. Attestation (the real boundary)

- **Android Play Integrity API** + **iOS App Attest/DeviceCheck**, verified **server-side**. Unified Expo lib: **`@expo/app-integrity`** (official, alpha) — config plugin + dev build, not Expo Go; isolate behind your own wrapper. Cross-platform alt: Talsec AppiCrypt. ([@expo/app-integrity](https://docs.expo.dev/versions/latest/sdk/app-integrity/))

## Prioritized "bake into skeleton"

**CRITICAL (free, mostly managed-safe):** three storage modules + ESLint ban on raw AsyncStorage for secrets; SecureStore defaults + >2KB session adapter; Supabase PKCE + RLS-on-by-default migration + CI assertion; secrets lint rule (reject `EXPO_PUBLIC_*` matching SECRET|TOKEN|SERVICE_ROLE…) + BFF proxy; ATS/cleartext off; system-browser OAuth + verified-link callback + token redaction; deep-link allowlist gate; supply-chain (frozen lockfile + minimumReleaseAge + Socket); Lefthook local gates (gitleaks + ESLint + typecheck / Semgrep + audit); `expo-screen-capture`; MASVS matrix in SECURITY.md.
**STRONGLY RECOMMENDED (dev build):** `@expo/app-integrity` attestation; freeRASP; MobSF + hermes-dec at release; biometric vault tier.
**NICE-TO-HAVE:** SPKI cert pinning (toggleable, OTA pins); pre-Hermes obfuscation; npm Trusted Publishing + SBOM; Talsec RASP+/AppiCrypt for regulated apps.

**Expo Go caveat:** only SecureStore (no biometric), AsyncStorage, deep-link config, screen-capture work in Expo Go. MMKV, biometric, cert pinning, freeRASP, attestation, obfuscation all need a dev build / EAS build via config plugins — **none requires bare ejecting**.
