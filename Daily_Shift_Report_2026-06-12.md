# Daily Work Report — Double Shift

**Developer:** Achraf Benamrane
**Shift:** Wednesday 11 June 2026, 2:00 PM → Thursday 12 June 2026, ~6:00 AM — **≈16 hours (double shift)**
**Projects:** GetDraft (sports recruiting app) + Linky (Guinea marketplace & real-estate app)
**Date:** 2026-06-11

---

# Project 1 — GetDraft

**Stack:** Expo / React Native front end, NestJS + Supabase back end, Stripe billing
**Status:** ✅ **Feature-complete for this milestone.** Full app recording prepared for the client — **now waiting on client feedback.**

## Summary

Closed out the remaining client-requested features and ran a full pass of UX and stability fixes across the **signup flow, the talent globe, the social layer, subscriptions, and location**. Reset and seeded a realistic demo environment, produced a fresh installable Android build (now with GPS), and pushed everything to GitHub (**48 commits**). The app is in a demoable, end-to-end working state.

## What was delivered

### 🔑 Signup & onboarding
- **Role-specific signup** — each user type (Player / Parent / Coach / Agent) now collects only the information relevant to it and writes to the correct profile table (athlete → athlete profile, coach/agent → recruiter profile with the right role type, parent → relationship).
- **Dynamic, sport-aware questions** — the athlete questionnaire adapts to the chosen sport; **removed duplicate questions** (no longer re-asks position/level already captured), **removed the graduation-year question**, and **removed the jersey-number field** (kept height + weight).
- **Free-plan fix** — choosing the free plan now enters the app cleanly instead of bouncing back to the login screen.
- **App-wide keyboard fix** — text inputs (multi-step forms, 6-digit OTP, etc.) now stay above the keyboard instead of being hidden behind it.

### 📍 Location (new)
- Redesigned the location step with **"Use my current location" (GPS)** + city search + a keyboard-safe layout.
- Now **saves precise latitude / longitude**, so each athlete plots at their real city.
- Added the location permissions + expo-location plugin to the app configuration (shipped in the new build).

### 🌍 Talent globe (3D)
- **Color-coded pins** — real, manually-created users show **green**; demo/seed users show **orange** — for instant visual distinction.
- **Worldwide placement** — athletes from **any country** now appear on the globe (≈75-country map), not just US/Canada. Precise coordinates always take priority over the country fallback.

### 📱 Social layer (Posts & Reels)
- **Save / bookmark button** added to feed posts **and** reels (front end + back end), wired to the existing **Saved** tab so users can revisit their saved posts and reels.

### 👤 Profile & subscriptions
- **"Manage Plan"** entry added to the profile — users can view, upgrade, or cancel their subscription directly from their profile (Stripe payment sheet).

### 🛡️ Guardian (parent verification)
- Parents can now **preview and retake** their declaration video before submitting it.

### 🔐 Auth & app launch
- Clean **sign-out on an expired session** (no more stranded "missing authorization token" state).
- The app now **always opens on the logo splash → welcome intro**, then routes by auth state.

### 🗄️ Environment, build & deploy
- Reset the database and **seeded a realistic demo roster** (12 athletes across US + Canada, 1 coach, 1 agent) using real in-app media — so the recording shows a populated **Globe / Rankings / Discover / Feed**.
- Cleaned out manual test accounts to leave a clean baseline for real testing.
- Produced a **new installable Android dev build** (includes GPS + all of today's fixes).
- **Pushed all work to GitHub** — 48 commits on the feature branch.
- Prepared a **client-demo recording playbook** (segment-by-segment shot list, delivered as a PDF).

## Commits (highlights)

```
feat(signup):    role-specific profile setup per user type
feat(onboarding):dynamic sport-based athlete questions, drop graduation
fix(onboarding): free plan enters the app instead of bouncing to login
fix(onboarding): drop duplicate level/position questions for athletes
fix(signup):     remove jersey number; keep height + weight
fix(ux):         keep text inputs above the keyboard app-wide
feat(profile):   manage plan entry on the profile screen
fix(guardian):   let parents review the recorded declaration before submitting
fix(auth):       sign out cleanly on an expired session instead of stranding the screen
feat(layout):    always open on splash → welcome, then route by auth state
feat(globe):     real athletes are green pins, demo seeds are orange
feat(globe):     place athletes from any country, not just US/Canada
feat(signup):    GPS + searchable location picker, keyboard-safe layout, save precise coords
feat(perms):     add location permissions and expo-location plugin for GPS
feat(posts):     save/bookmark button on feed posts + reels, wired to saved tab
```

## Status & next steps

- ✅ **The project is feature-complete for this milestone** — all client-requested items are built, the demo environment is seeded, and a full app recording has been prepared.
- ⏳ **Now awaiting client feedback** once they review the recording.
- ☑️ Pending on client sign-off: production backend redeploy and merge to the main branch.
- 🔎 One minor signup edge-case (a plan-step issue on a specific device path) is being monitored — it does not block the demo and will be confirmed/captured if it recurs.

---

# Project 2 — Linky

**Stack:** Expo / React Native front end, Supabase back end, Stripe + Mobile Money payments, escrow wallet
**Status:** ✅ **Feature-complete V1.** Full end-to-end functionality pass done, verified on a real device — **client APK build + advancement report being delivered.**

## Summary

Closed out V1 with three full passes over the entire app: an **external adversarial review** of the role/UX work (58 findings triaged and fixed, including money-display bugs and fake screens), a **server-hardening sweep** across the payment and escrow paths, and a **functionality-closure phase** that made every client-requested flow work end to end — visits, messaging, order shipping with tracking, payouts. Finished with live testing on a physical device, real-time messaging activated, the tab bar redesigned to 5 tabs, push notification infrastructure wired, and everything **pushed to GitHub (52 commits on main)**. The app is in a demoable, end-to-end working state on real money mechanics (test mode).

## What was delivered

### 🔍 External review of the role-scoping work — 58 findings fixed
- Independent multi-agent review over the role-scoped navigation and UX work, then fixed every confirmed finding: **7 blockers, 18 should-fixes, 11 nits**, plus a verification round that caught 8 more.
- Highest-impact fixes: sellers could not see or manage **their own products** anywhere; three fully **fabricated screens** still reachable (property offer, visit detail, demande chat); wallet/payout screens showing a confident **0 GNF** while loading or on error.
- Every error state across the app is now exclusive and honest: failures show a retry, cached data survives a failed refresh, loading shows skeletons, empties teach the user what to do.

### 🛡️ Server hardening (money + security)
- **Idempotency rewritten reserve-first** across all money endpoints — two concurrent identical requests can no longer both execute (double-order / double-payment class of bug closed).
- **QR receipt gate hardened**: scan token stripped from server caches and logs, strict token validation client-side, legacy confirmation route deleted.
- **Dispute integrity**: an admin who is party to an order can no longer rule on their own dispute.
- **Stripe live-readiness**: dashboard refunds and chargebacks now raise critical alerts; abandoned card payments swept safely (Stripe side cancelled first, local order second).
- Fixed a dormant wallet top-up bug so Mobile Money activation needs only the Lengopay contract.
- Admin dispute board now shows refunded/released history on first load.

### 🤝 Property visits — complete loop
- Buyers now have a real **« Mes demandes »** screen: every visit request with property card, date/time, and live status.
- Agent accepts or refuses → buyer is **notified** and the notification lands directly on the status list.
- Submitting a request updates the list instantly.

### 💬 Messaging — every surface, near-instant
- "Message" button wired on **product, property and shop** pages.
- **Real-time delivery activated** (~1 second instead of 30 s polling).
- Chat header cleaned of invented data (fake "online" status and dead icons removed).

### 📦 Order shipping — new end-to-end flow
- Seller marks an order shipped with **carrier + tracking number** → status flips, the event lands in the order timeline, and the **buyer is notified with the tracking number**.
- Buyer's QR-scan confirmation and dispute button stay available while the package is in transit; verified on a real device, with the escrow status gates widened server-side the same day a review caught the gap.

### 💰 Wallet & payments honesty
- Recharge screen rebuilt as an honest "Bientôt" surface pointing users to the working path: **pay by card at checkout, no balance needed**.
- Seller payouts and home wallet cards show "—" with retry instead of fake zeros on slow networks.

### 🧭 Navigation redesign — 5-tab bar
- Tab bar capped at **5 tabs**: Accueil, Marché, Découvrir, Messages, Profil.
- **Boutique fused into Profil** as a hero card — sellers see "Ma boutique", agents see "Mes biens", dual-role users see both. One tap into the pro workspace.

### 🔔 Push notifications — infrastructure wired
- Google Services build wiring, notification color, manifest config and a full setup runbook landed; coverage audit confirms **14/14 events** emit notifications.
- Remaining step is console-side (Firebase project + key upload) — in-app notifications fully working meanwhile.

### 📱 Device testing & stability
- Fresh Android dev build produced; **EAS cloud build documented as the release path** (sidesteps two Windows-only native build failures).
- Live smoke test on a physical phone against the production backend: seller ship flow, buyer notification, timeline, status transitions — **passing**.
- Real-device dark mode, role scoping and tab redesign verified by hand.

### 🗄️ Environment, build & deploy
- **Pushed all work to GitHub — 52 commits on main** (secret sweep run before push: zero credential values in the repo).
- Rotation log and security posture documented.
- Client advancement report (French, PDF) prepared alongside the **EAS preview APK build** for client delivery.

## Commits (highlights)

```
feat(phase-T4):  production UX states + dead UI + paper cuts
fix(phase-U0a):  review blockers — own-products filter, fake screens, money-state lies
fix(phase-U2+U3):self-visit guard + cart survives payment cancel
feat(phase-U5):  notifications pagination + branded not-found + deeplink guard
fix(phase-V1):   idempotency reserve-first
fix(phase-V4):   self-deal assertion in resolve_dispute
feat(phase-V5):  stripe charge.refunded + charge.dispute.* alerting
feat(phase-V6):  stale stripe-PI sweep (cancel-first ordering)
feat(phase-X1):  buyer-side visit list + notification deeplink
fix(phase-X2):   wire shop Message button + drop fake chat-header UI
feat(phase-X6a): android push wiring + PUSH_SETUP.md
feat(phase-X6b): order-shipped flow end-to-end (tracking + buyer notify)
fix(phase-X9):   widen RPC status gates for 'preparing' (escrow integrity)
feat(phase-X10): 5-tab bar + Boutique fused into Profil
feat(phase-X11): realtime messaging activated (JWT bridge)
```

## Status & next steps

- ✅ **V1 is feature-complete** — every client-requested flow works end to end; tested live on a real device against production.
- 🚀 **Client delivery in progress**: EAS preview APK (cloud build, shareable install link) + French advancement report (PDF).
- ⏳ **Pending on the client side** (each a same-day activation once provided): Lengopay contract → Orange Money / MTN payments; US LLC → live card payments; Apple Developer account → iOS; brand assets → final visual identity.
- 🔎 Firebase console step (≈10 min) activates push notifications on devices; everything code-side is ready.

---

*Report of 11 June 2026. ~16-hour double shift (11 June 2:00 PM → 12 June ~6:00 AM) across GetDraft and Linky.*
