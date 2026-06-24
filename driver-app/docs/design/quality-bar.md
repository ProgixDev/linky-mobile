---
id: design-quality-bar
read-when: Writing a design brief, reviewing UI (design or implementation), or building any screen. The bar both the design pass and the build pass must clear.
owns: What "professional, not amateur/vibe-coded" means here — the premium-UI checklist + the reject-worthy tells.
---

# Design quality bar

The thesis (from `docs/research/04-design-and-prompting.md`): **premium UI is a small, fixed,
named system applied with restraint and consistency.** "Vibe-coded" UI fails because it makes
ad-hoc decisions and reaches for tool defaults — the statistical average of all training data.
Premium = **intentional deviation from defaults, inside a disciplined system.**

> **The skeleton ships a placeholder indigo (`#6366F1`) brand ramp — and default indigo/purple is
> the single most recognizable AI tell, so each app MUST rebrand it** (see "Rebrand checklist"
> below) before shipping. This app (Linky Driver) has done so: `tailwind.config.js` is rebranded to
> the Linky **emerald `#0E6E55` + saffron `#E8A53D`** palette. The default Inter font remains the
> same trap — still on the design-pass list.

## Premium-UI checklist (a brief must demand it; a review must verify it)

**Spacing & layout**

- All spacing on a 4/8pt grid from a named scale (no arbitrary values).
- Generous whitespace ("too much, then remove"); the screen is not crammed.
- Inner spacing ≤ outer spacing (proximity = grouping). Tap targets ≥44pt (hitSlop small icons).

**Typography**

- One modular scale (~1.25), base ~16; named roles. Max ~2 weights, none under 400.
- De-emphasize via color/size, not lighter weight. Line-height inverse to size.
- A **distinctive** typeface — not Inter/Roboto/Arial/Open Sans/system default.

**Color**

- Full palette defined as tokens (8–10 neutrals + brand + semantic); no on-the-fly lighten/darken.
- No pure black/white/grey (neutrals carry slight saturation). 60-30-10; accent only for CTA/active/focus.
- WCAG AA: 4.5:1 text, 3:1 UI/large text. **No default Tailwind colors, no purple-on-white gradient.**

**Depth & icons**

- Single light source; one elevation system; layered, color-tinted shadows (never one pure-black).
  No shadow soup, no nested cards-in-cards.
- One icon set, one stroke weight, consistent fill/outline; optically sized; baseline-aligned.

**Dark mode**

- Dark-grey base (~#121212 class), desaturated accents, elevation via tonal surface — **not**
  inverted light-mode hex. Designed and tested independently from light mode.

**States (every screen)**

- Empty (purpose + one CTA), loading (skeleton/shimmer >1s, progress >10s — not a bare spinner),
  error (inline, plain-language, recovery path), success.
- Onboarding value-first (delay signup wall); permission soft-prompt before the OS dialog; paywall
  with price + Restore + Terms/Privacy; settings grouped with the account-deletion path.

**Motion**

- 200–300ms typical; real easing (no linear except spin); exits faster than enters.
- One signature shared-element/container transition for the hero flow; staggered reveals; animate
  transform/opacity (not layout). Haptics tied to meaningful state changes, proportional, optional.

**Differentiation (the 4.3 / originality angle)**

- A defined signature motion vocabulary, one hero interaction, branded voice/microcopy, and custom
  (not stock) iconography/illustration. The app must not read as a recolored template.

## Reject-worthy tells (if you see these, it's amateur)

Default indigo/purple + Inter; purple-on-white gradient hero; a three-icon-box features row;
center-everything; lorem ipsum or unrealistic single-length data; one fuzzy pure-black shadow on
every card; dark mode that's just inverted light mode; missing empty/error/loading states; a paywall
without Restore/price/legal links; gray-on-gray low-contrast text; mixed icon families.

## Rebrand checklist (do this per app — kills the "template/default" look)

1. Replace the `brand-*` ramp in `tailwind.config.js` (+ mirror in `src/shared/theme/colors.ts`)
   with a real, distinctive palette — not default indigo. Keep the **role** structure.
2. Swap the typeface from Inter to a distinctive choice loaded in the root layout.
3. Set real app identity (name/slug/scheme/bundle id/icon) — `npm run store:check` flags leftovers.
4. Define one signature interaction + branded microcopy voice.

## How this is enforced

- The **design brief** (`docs/templates/claude-design-prompt.md`) bakes the contract + DO-NOT list in.
- The **`/design-prompt` skill** fills it from project context and runs a self-critique pass.
- The **build pass** must clear this same checklist; the `ux-reviewer` persona checks it on review.
- Token discipline is structural: components reference role tokens, never raw hex
  (`docs/conventions/design-system.md`).
