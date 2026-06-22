# Claude Design Prompt — {{Project name}}

> Filled by `/design-prompt` from project context + the design-token contract, then pasted
> into Claude Design. **Design intent only — no code, no component names, no class names.**
> This brief is built to defeat "vibe-coded" output: it supplies a token contract, specific
> reference anchors, mandatory states, and an explicit DO-NOT list. Rationale + evidence:
> `docs/research/04-design-and-prompting.md`; the bar is `docs/design/quality-bar.md`.

---

## 0. Role (set the altitude)

You are a senior product designer with a print-design background who obsesses over spacing,
hierarchy, and restraint. You are designing for a native iOS + Android app. **Apply the design
system below — do not invent a new aesthetic.** Premium design is a small, fixed, named system
applied consistently; avoid the statistical-average defaults of AI design.

## 1. Product surface (concrete, not vague)

- **What this is, in one sentence:** {{the product + the core gesture + the emotional register}}
- **Screens to design (name each):** {{e.g. onboarding, home, detail, create, settings, paywall}}
- **For each screen: the real content, fields, and actions** — use **realistic sample data**, never
  lorem ipsum (real data lays out differently: "$1,284.50", "3 days ago", a 28-character name).

## 2. Context of use (who / when / why)

- **User + the moment they're in:** {{persona, one-handed?, commute/desk, time pressure}}
- **The outcome they want:** {{the one job this flow must make effortless}}
- **Platform + appearance:** iOS + Android; **design BOTH light and dark** (not one inferred from
  the other).

## 3. Brand & aesthetic anchors (escape the average)

- **Tone (2–4 words):** {{e.g. calm, editorial, high-contrast, trustworthy}}
- **Named references:** {{"like [real app]'s [specific quality]"}} + follow **Apple HIG / Material 3**
  platform idioms.
- **A specific/cultural anchor (optional but powerful):** {{an era, medium, or place — "1970s
  transit signage", "Japanese editorial layout" — NOT "clean and modern"}}
- **Attach 3–5 reference images** (Pinterest / Behance / Dribbble). For each, one line on **what to
  borrow — the visual, not the function.**

## 4. Design-token contract (use ONLY these — this is the anti-vibe-coding contract)

> The skeleton's tokens live in `tailwind.config.js`. **The default brand palette is a
> placeholder indigo and MUST be rebranded per app** — shipping default indigo/purple is itself a
> vibe-coded tell. Replace the brand ramp below with this app's real palette before designing.

- **Color (roles, not hues):** background / surface / surface-muted; text / text-muted / text-faint;
  **brand** (one CTA/active color, 60-30-10 — accent only for primary action/active/focus);
  semantic success / danger. Define a full ramp (≈8–10 neutral steps + brand steps). **No pure
  black/white** (use near-black, slightly-saturated neutrals). Dark mode = dark-grey base (~#121212
  class), **desaturated** accents, elevation by tonal surface — not inverted hex.
- **Type:** one modular scale (~1.25 ratio), base 16; roles display / title / body / label / caption;
  **max ~2 weights**; de-emphasize via color/size, not lighter weight. **A distinctive typeface —
  NOT Inter/Roboto/Arial/Open Sans/system default.**
- **Spacing:** 4/8pt grid, named steps; generous whitespace (start with too much, then remove);
  tap targets ≥44pt.
- **Radii & depth:** consistent corner radii; ONE elevation system; **layered, color-tinted
  shadows** (never a single pure-black shadow); single light source. No "shadow soup".
- **Motion:** durations 200–300ms (range 50–600); real easing (no linear except spin); **exits
  faster than enters**; one signature shared-element/container transition for the hero flow;
  haptics tied to meaningful state changes.

## 5. Required states for EVERY screen (not just the happy path)

Empty (purpose + one CTA + on-brand illustration), loading (skeleton/shimmer for operations over
1s; a progress bar for operations over 10s — not a bare spinner), error (inline, plain-language,
with a recovery path), success. Plus, where relevant: **onboarding** (value first, delay the signup
wall), **permission priming** (soft pre-prompt before the OS dialog), **paywall** (price +
what-you-get + Restore + Terms/Privacy), **account/settings** (grouped, with the account-deletion
path).

## 6. Accessibility (non-negotiable)

WCAG AA contrast (4.5:1 text / 3:1 UI + large text); tap targets ≥44pt; support Dynamic Type /
larger text without breakage; respect reduced motion; meaningful labels; don't rely on color alone.

## 7. DO NOT (forbid the defaults — this section matters as much as the rest)

- Inter / Roboto / Arial / Open Sans / system default fonts (and not Space Grotesk as the "second
  default" either).
- Purple/indigo gradients on white; default Tailwind named colors; the placeholder brand indigo.
- A three-icon-box "features" row; center-everything layouts; shadow soup / nested cards.
- Pure black or pure white; lorem ipsum; inventing tokens outside the contract.

## 8. Process & self-critique (how to deliver)

Work in passes: (1) layout & hierarchy only → (2) apply tokens/theme → (3) content & states →
(4) motion & polish → (5) responsive (test 375px + landscape). For the first screen, give **3
distinct directions** to choose from (don't settle on the first — it's usually the average). After
rendering, **self-critique against this brief, the premium-UI checklist (`docs/design/quality-bar.md`),
and Refactoring-UI hierarchy principles**, and list what you'd refine.

## 9. Out of scope (this pass)

- {{anything explicitly deferred}}

---

_Export the screens as a ZIP back to Cowork; the implementation pass (Claude Code) reads the same
token contract and the premium-UI checklist when building the screens._
