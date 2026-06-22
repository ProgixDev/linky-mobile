---
id: research-design-and-prompting
read-when: Implementing Phase 4 (design prompts) and Phase 7 (shared UI) — building the professional design brief and the premium-UI bar.
owns: Premium-UI attributes, design-token architecture, the professional AI design brief template, anti-vibe-coding constraints.
---

# Premium Mobile UI + Professional AI Design Briefing — 2025–2026

**Thesis (every source agrees):** Premium UI is **a small, fixed, named system applied with
restraint and consistency.** "Vibe-coded" UI fails because it makes ad-hoc decisions and reaches
for tool defaults (Tailwind indigo, purple-on-white gradients, Inter, single black shadows, mixed
icons, centered everything) — the statistical average of all training data. Premium = **intentional
deviation from defaults inside a disciplined system.** ([Anthropic](https://claude.com/blog/improving-frontend-design-through-skills), [Refactoring UI](https://refactoringui.com/previews/building-your-color-palette/))

## 1. Premium vs amateur — concrete attributes

- **Spacing:** 4/8pt grid; constrained **non-linear named scale** (xs…3xl); "start with too much whitespace, then remove" (cramming is the #1 tell); inner spacing ≤ outer; tap targets ≥44pt (hitSlop on small icons).
- **Type:** one modular scale (~1.25 Major Third), base ~16px, named roles; **max ~2 weights, none <400**; de-emphasize via color/size not weight; line-height inverse to size; tracking tightens as size grows. M3 scale: Display 57/45/36 · Headline 32/28/24 · Title 22/16/14 · Body 16/14/12 · Label 14/12/11. **Avoid Inter/Roboto/Arial/Open Sans** (training-data defaults).
- **Color:** you need 8–10 greys + primary(s) + semantic, **all shades pre-defined as tokens** (never `lighten()`/`darken()` live); **never pure black/grey** (add slight saturation); rotate hue 20–30° + bump saturation when shading; **60-30-10** (accent only for CTA/active/focus); WCAG AA 4.5:1 text, 3:1 UI components. **#1 AI tell:** Tailwind default colors + purple→cyan gradients.
- **Depth:** single light source; consistent offset ratio; **layered, color-tinted shadows** (never single pure-black); one depth system (shadow OR border); small fixed elevation token set; no "shadow soup"/nested cards.
- **Icons:** one set, one stroke weight, one fill/outline; optically sized; baseline-aligned.

## 2. Design tokens (3-tier — EightShapes)

1. **Primitive/global** — raw values (`color-neutral-42`, `space-2x`).
2. **Semantic/alias** — purpose (`color-error`, `bg-primary`) — the load-bearing middle layer; skipping it breaks rebrand/dark-mode.
3. **Component** — scoped (`button-primary-bg`).

- **Dark mode ≠ inversion:** base on `#121212`-class grey; **desaturate accents**; elevation via tonal surface layering (M3 surface-container roles).
- **W3C Design Tokens format** stable since 2025.10 (JSON, `$value`/`$type`, aliases, theming, OKLCH/P3). Pipeline: **Tokens Studio (Figma) → Git → Style Dictionary → JS/Tailwind theme → NativeWind config**. Use semantic tokens backed by CSS variables so one class (`bg-brand`) resolves per theme (avoid `dark:` sprawl).

## 3. "Boring screens" done well

- **Onboarding:** value-first, **delay the signup wall**, ≤7 steps, learn-by-doing.
- **Permissions:** reversible **soft pre-prompt** before the one-shot OS dialog, contextual timing; neutral buttons. Apple forbids manipulative permission screens.
- **Paywall:** Apple requires name/duration, what-you-get, localized renewal price, sign-in/**Restore**, Terms+Privacy. Toggle paywalls get rejected. High-converting: subtle animation, plain-benefit copy, framed discounts, trial framed throughout, price anchoring.
- **Empty states:** purpose + why + **one** CTA + optional on-brand illustration; distinguish first-use vs cleared vs error.
- **Error states (NN/g):** inline, next to field, explicit/human/constructive, color+icon, never a dead-end.
- **Loading:** skeletons for full-page <10s; spinner for single module 2–10s; progress bar >10s; neither under 1s. Optimistic UI for chat/likes.
- **Settings:** grouped inset lists, distinct account/privacy sections.

## 4. Motion (calculated, not random)

- **Durations (M3):** most UI 200–300ms; <100ms = snap; >500ms = laggy; **exits faster than enters**; duration scales with travel.
- **Easing (M3 cubic-beziers):** Standard `(0.2,0,0,1)`; Decelerate `(0,0,0,1)` entering; Accelerate `(0.3,0,1,1)` exiting; Emphasized for hero moments. **Avoid linear** except rotation.
- **Springs** for gesture-driven/interruptible motion; duration-curves for choreographed entrance/exit. Reanimated `withSpring` (mass/stiffness/damping).
- **Shared-element / container transform** = the premium continuity pattern. Choreograph: staggered reveals (30–50ms/item), animate transform/opacity (not layout props).
- **Haptics:** impact (taps/toggles), selection (pickers), notification (success/warning/error); tied to a visual state change, proportional, optional.

## 5. Advanced AI design prompting (the rebuild core)

- **Why cheap prompts fail (Anthropic):** "distributional convergence" — vague words like "clean and modern" tell the AI _"I have no preference"_ → generic Inter + purple gradient output. The model has no taste; **you** supply constraints, references, judgment.
- **Frameworks converge:** v0 (Product surface · Context · Constraints+taste), Figma TC-EBC (Task·Context·Elements·Behavior·Constraints), PROMPT (Platform·Role·Output·Mood·Patterns·Tech). "Constraints tell it what NOT to invent."
- **Highest-leverage technique — tokens as a contract:** generate tokens FIRST, paste them in every prompt: "Use ONLY what's defined." Without it "by component #5 your UI is a patchwork quilt." Constrain the component library, prefer semantic props (`variant="destructive"` over `className="bg-red-500"`), enforce with linters — "trust but verify."
- **Reference anchoring:** name real apps ("like Linear — compact density, subtle sidebar"), name systems (Apple HIG / M3), use cultural/specific anchors ("1970s ski lodge: burnt orange, avocado"). Best workflow: 3–5 references → AI describes them → paste into build prompt. Feed screenshots of its own output back.
- **Forbid the defaults (negation lowers token probability):** NO Inter/Roboto/Arial/system fonts (and not Space Grotesk by default); NO purple/indigo gradients on white; NO Tailwind default color names; NO three-icon-box hero; NO center-everything; NO lorem ipsum (use realistic data — "$1,299.00" lays out differently than "$42.50"); always specify light/dark; always require empty/loading/error states.
- **Iteration:** multi-pass (Layout → Theme → Content → States → Responsive); ask for **3 directions** to escape the first local maximum; lock themes with XML tags; assign a persona ("senior designer with a print-design background").
- **Claude-specific:** steerable at "the right altitude" (avoid both exact hex and vague platitudes); package the design system as a **Skill / CLAUDE.md** so it loads on demand without context bloat.

## 6. Originality / differentiation (avoid thin-clone)

Differentiation lives in **small, consistent, systematized details**: a signature motion vocabulary defined _before_ designing; custom illustration/iconography ("visual territory competitors can't replicate"); consistent branded voice/tone in microcopy; one "hero" interaction. The clone tell: trendy effects with no consistent motion language, default design-system look, stock visuals, voiceless microcopy.

## 7. Tools for the Expo + NativeWind stack

- Inspiration: Mobbin, Page Flows, Refero. Icons: **Lucide** base + `expo-symbols` for iOS chrome. Fonts: `@expo/google-fonts` (ship static per-weight on mobile — variable fonts only partly supported). Components: **react-native-reusables** (shadcn-for-RN) or **gluestack-ui v2** (pick one; not Tamagui alongside). Motion: Reanimated + Moti + Gesture Handler + **Skia** for shaders/gradients. Tokens: Tokens Studio → Style Dictionary → NativeWind. Color/a11y: Radix Colors / Tailwind OKLCH + InclusiveColors.

## (a) "Premium UI" checklist a brief MUST demand

Spacing on 4/8pt named scale; generous whitespace; tap ≥44pt. One ~1.25 type scale, ≤2 weights, distinctive font. Full token palette (8–10 greys + semantic), no pure black, 60-30-10, WCAG AA, NO Tailwind defaults. Single light source, layered tinted shadows, one elevation system. One icon set/weight. 3-tier tokens; dark mode = dark-grey base + desaturated accents (not inversion). Every screen has empty/loading/error; onboarding value-first; permission soft-prompt; paywall with Restore + localized price. Motion 200–300ms, real easing, ≥1 shared-element transition, haptics tied to state. Differentiation: signature motion, hero interaction, branded voice, custom icons.

## (b) Professional AI design brief — template (ship as `design-brief.md`)

```md
# DESIGN BRIEF — [App / Screen]

## 0. ROLE Senior product designer + RN/NativeWind engineer, print-design background, obsessed

with spacing/hierarchy/restraint. APPLY the existing design system, don't invent a new aesthetic.

## 1. PRODUCT SURFACE Screen purpose (1 sentence). Exact components/data/actions with REALISTIC

sample values (not lorem). Sections in priority order.

## 2. CONTEXT OF USE Persona, moment, decision/outcome, one-handed?, platform, device, light/dark (specify).

## 3. BRAND & AESTHETIC ANCHORS 2–4 tone words; named refs ("like [app]'s [quality]" + HIG/M3);

a cultural/specific anchor; attach 3–5 reference screenshots or an AI description of them.

## 4. DESIGN TOKENS (the contract — paste the actual set) color (primitive+semantic light/dark),

space (4/8pt), radius, type (~1.25, base 16, distinctive font, ≤2 weights), elevation (tinted,
single light source), motion (200–300ms, M3 easing, spring config).
RULE: use ONLY these tokens; no raw hex / Tailwind defaults / ad-hoc spacing; semantic props over className.

## 5. COMPONENT CONSTRAINTS Only [react-native-reusables/gluestack]; one nav pattern; Lucide icons, one weight.

## 6. REQUIRED STATES Empty, loading, error, success + screen-specific (onboarding/permission/paywall).

## 7. MOTION & HAPTICS Entrance stagger [duration/easing]; one signature/shared-element interaction; haptics map.

## 8. ACCESSIBILITY WCAG AA; tap ≥44pt; Dynamic Type; labels.

## 9. DO NOT No Inter/Roboto/Arial/system (nor Space Grotesk default); no purple-on-white gradients;

no Tailwind default colors; no three-icon-box hero; no center-everything; no pure black; no lorem; no inventing tokens.

## 10. PROCESS Passes (layout → tokens → states → motion → responsive); give 3 directions for screen 1;

self-critique against this brief + the premium-UI checklist.
```

**Packaging:** ship sections 0/4/5/9 as a persistent design Skill / CLAUDE.md (loads on demand); each screen task supplies 1–3, 6, 7. Enforce 4/5/9 with NativeWind lint rules + PR checks, not prose alone.
