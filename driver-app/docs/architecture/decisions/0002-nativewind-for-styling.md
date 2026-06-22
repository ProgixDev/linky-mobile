# ADR-0002 — NativeWind 4 for styling

- **Status:** accepted
- **Date:** 2026-06-06
- **Deciders:** platform team, design

## Context

We need one styling system that is fast at runtime, expresses a token-based
design system, works on iOS/Android/web, and is maximally legible to AI
agents (Tailwind has enormous training-data coverage).

## Decision

NativeWind v4 (stable, Tailwind CSS v3) with tokens defined in
`tailwind.config.js`. `className` is the only sanctioned styling mechanism in
feature code; `cn()` handles conditionals; shared primitives encapsulate
variants.

## Consequences

- Positive: agents produce on-system UI by default; prettier-plugin-tailwindcss
  gives deterministic class order; design review reduces to token review.
- Negative: Tailwind v4/NativeWind v5 migration later (tracked; v5 is
  pre-release as of 2026-06); a second mental model (className vs style) for
  RN veterans.
- Enforcement: review rule + grep in persona checklist (no `StyleSheet.create`
  in `src/features`), docs-lint typography check, tokens-only palette.

## Alternatives considered

- StyleSheet + theme object: verbose, drifts, weak agent affordance.
- Tamagui/Restyle: powerful but heavier conceptual load; smaller
  training-data footprint; lock-in.
- Expo UI (SwiftUI/Compose primitives): compelling for native-feel surfaces;
  adopt selectively later without changing this decision.
