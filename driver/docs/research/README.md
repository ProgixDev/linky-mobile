---
id: research-index
read-when: You need the evidence/citations behind a roadmap decision, or you're implementing a phase and want the concrete library names, code patterns, and source URLs.
owns: Pointers to the six research briefs that ground the UPGRADE-ROADMAP.
---

# Research briefs (2025–2026)

These six briefs are the cited evidence base for `UPGRADE-ROADMAP.md`. Each is AI-legible:
findings → concrete skeleton recommendation → source URL. When implementing a phase, read
the matching brief first so you copy the _verified current_ pattern, not a guess.

| Brief                                                            | Read when working on                                                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [01-mobile-security.md](01-mobile-security.md)                   | Phase 1 — secure storage, secrets, transport, RASP, attestation, supply chain, local gates                               |
| [02-store-compliance.md](02-store-compliance.md)                 | Phase 3 — Apple/Google rules, rejection triggers, privacy manifests, the rule base                                       |
| [03-supabase-security.md](03-supabase-security.md)               | Phase 2 — RLS, auth on Expo, keys, Edge Functions, DB hardening, payments→DB                                             |
| [04-design-and-prompting.md](04-design-and-prompting.md)         | Phase 4 & 7 — premium UI attributes, design tokens, the professional AI design brief                                     |
| [05-agent-skill-architecture.md](05-agent-skill-architecture.md) | Phases 5 & 6 — skills, plugins, hooks, subagents, AI-legible docs                                                        |
| [06-payments-analytics-stack.md](06-payments-analytics-stack.md) | Phases 2,3,6 — RevenueCat + Supabase + PostHog + Sentry decision                                                         |
| [07-community-sentiment.md](07-community-sentiment.md)           | Anytime — the lived-experience/forum view of what actually bites builders in our situation, and how it sharpens the plan |

**Provenance.** Compiled 2026-06-18 by six parallel web-research passes against primary sources
(OWASP MASVS/MASTG, Apple Developer, Google Play, Supabase docs, Anthropic docs/engineering,
RevenueCat/PostHog/Sentry). Claims are cited inline. Re-verify version-specific details before
relying on them — store policies and SDK APIs move fast.
