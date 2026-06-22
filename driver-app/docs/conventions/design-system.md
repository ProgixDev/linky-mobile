# Design System

Single source of truth: **`tailwind.config.js`** — the **token contract**. Designers own this
file's token values; engineers own its structure. The imperative mirror
(`src/shared/theme/colors.ts`) must stay in sync — PRs touching one must
touch both (reviewer + persona checklist item). The quality the design + build passes must clear
is [`docs/design/quality-bar.md`](../design/quality-bar.md).

> **The default `brand-*` ramp is placeholder indigo (`#6366F1`) and the default font is Inter —
> the two most recognizable "vibe-coded" AI tells. Rebrand both per app** (keep the role structure;
> see the quality-bar "Rebrand checklist"). Tokens are roles (semantic) backed by hex (primitive);
> components reference roles, never raw hex — that semantic layer is what makes rebrand + dark-mode
> possible.

## Dark mode

Design light and dark **together**, not one inferred from the other: a dark-grey base (≈`#121212`
class), **desaturated** accents (saturated colors vibrate and fail contrast on dark), and elevation
expressed as tonal surface lightening — never inverted light-mode hex.

## Tokens

- **Color roles, not hues:** `brand-*` (action), `surface[-muted|-inverse]`
  (backgrounds), `ink[-muted|-faint|-inverse]` (text), `danger`, `success`.
  Components never reference hexes.
- **Type scale via `AppText` variants:** `display` (32/bold) · `title`
  (20/semibold) · `body` (16/regular) · `label` (14/medium) · `caption`
  (14/regular muted). Need a new size? Propose a variant, don't inline it.
- **Font:** Inter (400/500/600/700) loaded in the root layout; classes
  `font-sans[-medium|-semibold|-bold]`.
- **Radii:** `rounded-card` (16) for containers, `rounded-control` (12) for
  inputs/buttons. **Spacing:** Tailwind scale, screen gutter `px-5` via
  `<Screen>`.

## Typography copy rules

User-facing strings use real typography: curly apostrophes (’) and quotes
(“ ”), ellipsis character (…). docs-lint fails straight apostrophes in UI
text — this is the canonical example of taste encoded as a check. British vs
American spelling: American. Sentence case for headings and buttons
(“Add task”, not “Add Task”).

## Component policy

`shared/ui` is the **lean** kit: `AppText`, `Button` (primary/secondary/ghost/
destructive × md/sm, loading state), `Screen`, `TextField`, `Card`, `EmptyState`,
`Skeleton`. It grows **on demand** via `/new-component`, not by pre-building a
big library (the "lean core + generator" decision — ADR/roadmap). Extending the
kit beats local styling; new primitives need a quick design sign-off and tests.
Accessibility is part of the definition of done: roles, labels, 44pt touch
targets, `accessibilityState` for toggles — see the
[UX reviewer persona](../personas/ux-reviewer.md).

## Painted-door experiments

Designers may ship UI with a no-op backend behind an analytics event to test
demand — the UI lives in the feature's `ui/`, shows an honest interim state,
and must be flagged in the PRD + removed or wired within two sprints. **Never
ship a placeholder / “coming soon” state in a store build** — Apple 2.1 rejects
it and `npm run store:check` flags it (`docs/store/checklist.md`). Painted-door
experiments are for internal/TestFlight demand-testing, not App Store review.
