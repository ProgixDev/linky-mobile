# Linky — Work Report

**Developer:** Achraf Benamrane
**Date:** 14 June 2026
**Project:** Linky 
**Status:** ✅ **V1 complete & fully bilingual (FR/EN).** Updated client APK + advancement report delivered.

---

## Summary

Major feature + reliability day on top of the V1 base. Delivered the client APK on the landing page, fixed two data-integrity blockers that were corrupting every new listing, shipped profile photos (mobile + backend + admin), card-funded wallet recharge (Stripe), and a seller/agent editing pass (shop, listings, stats). Closed it out by taking the whole app **fully bilingual (French / English, ~1275 keys, live switching)**. Four independent adversarial reviews were run across the new money/identity surfaces; every confirmed finding was fixed, and the backend functions were redeployed and probed healthy. Everything committed on `main`.

---

## What was delivered

### 🌍 Full internationalization — French / English
- The entire app is now bilingual: every buyer, seller and agent screen, settings, and the legal documents.
- ~1275 translation keys, live language switching, with module-scope "frozen string" arrays correctly resolved at render.
- Pular & Soussou scaffolded as complete skeletons with a CSV round-trip — the client's translators can fill them in with zero code changes.

### 🔴 Create-flow data-integrity blockers fixed
- Every product shipped with an **empty city** (the wizard never collected it) → invisible to the marketplace city filter. Built a reusable curated city picker (canonical Guinea city list).
- Every property defaulted to a **rental** — there was no type selector, so agents could not list **sales (vente)** or **land (terrain)** at all. Added it.
- Hardened after an adversarial review (terrain clears stale fields, preview gates on city, etc.).

### 📷 Profile photos — mobile + backend + admin
- Users can set a profile photo from edit-profile (pick → square crop → upload).
- New backend: a public `avatars` storage bucket, an `avatar` kind on the signed-upload endpoint, and `update-profile` accepting a validated `avatar_url` (must resolve to our own storage).
- Admin Users table renders the avatar. Security-reviewed and hardened (also closed a pre-existing gap where shop cover/logo URLs were unvalidated).

### 💳 Card-funded wallet recharge (Stripe top-up)
- The "Recharge" screen now works end to end: enter an amount → Stripe payment sheet → wallet credited via the webhook → ledger.
- New `wallet-topup-card` function + a top-up branch in the Stripe webhook reusing the idempotent `confirm_topup` RPC.
- A money/abuse review caught a missing settled-amount check (the order rail has it, the top-up branch didn't) — added. Works in test mode; real money is a live-key swap. Orange/MTN recharge stays blocked on the Lengopay contract.

### 🏪 Seller / agent editing pass
- Audited the seller/agent surfaces (money flows, visits and growth tools were already real).
- New **shop-edit** screen (name, city, logo, cover, about) wired to the previously dead identity pill.
- **Listing edit** for products and properties (was status-only); a "waiting for payment" message on unpaid orders.
- The **stats** screen now counts properties too — an agent previously saw "0" despite having viewed listings.

### 💸 Withdrawal screen rebuilt
- The payout was un-actionable — it recorded a destination of "Orange Money" with no phone number, so an admin had nothing to pay out to.
- Rebuilt with a mobile-money number field, an editable amount, branded operator rows, balance validation, and proper empty/loading/error states.

### 🧭 Catalogue reliability
- Home category tiles now land on the correct filtered products — the tile codes were misaligned with how products are stored; aligned them and added the missing "Services" filter.
- Removed the top home search box per request.

### 📲 Landing page — client APK delivery
- Working Android APK download button (stable hosting, clean `/linky.apk` filename), App/Play Store "coming soon" badges, a responsive pass, and a branded URL — the client can install directly from the landing.

### 🧹 Cleanup & backend ops
- Deleted 5 orphaned mock data files (774 lines) and fixed the stale README.
- Deployed the updated edge functions (`photo-upload-url`, `update-profile`, `shop-upsert`, `wallet-topup-card`, `stripe-webhook`), all verified healthy with the garbage-bearer probe; provisioned the avatars storage bucket.

### 🔍 Adversarial reviews
- Ran four independent multi-agent reviews — create-flow fixes, the avatar feature, the seller/agent audit, and the card top-up (money/abuse).
- Folded in the real findings (top-up amount validation, terrain stale-field clearing, the shop-upsert URL gap) and rejected the false positives after verifying against the code.

---

*Report of 14 June 2026.*
