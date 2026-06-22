# Styling (NativeWind 4 + Reanimated 4)

## NativeWind

- Style via `className` exclusively. Static inline `style` objects and
  `StyleSheet.create` in features are review-rejected; `style` is allowed only
  for values that _must_ be dynamic at runtime (e.g. safe-area insets in
  `Screen`).
- Conditional classes use `cn()` from `@/shared/lib/cn` (clsx + tailwind-merge)
  — never string templates.
- Tokens live in `tailwind.config.js` (colors `brand/surface/ink/danger/
success`, fonts `sans*`, radii `card/control`). **Never hardcode a hex color
  or raw font name in a component.** The rare imperative color comes from
  `@/shared/theme/colors.ts` (kept in sync with the Tailwind palette).
- Dark mode: tokens are designed to be remapped; when dark mode lands, it'll
  be via CSS variables in `global.css` + a `dark:` variant pass — see the ADR
  process before improvising.
- NativeWind v4 targets Tailwind CSS v3 (v5/v4 migration tracked in an ADR
  when it goes stable).

## Component hierarchy

1. Reach for a shared primitive first: `AppText`, `Button`, `Screen`,
   `TextField` (`@/shared/ui`).
2. Need a variant? Extend the primitive's variant map — don't fork styling at
   the call site.
3. Genuinely feature-specific UI lives in `features/X/ui/` and _composes_
   primitives.

## Animation rules (Reanimated 4)

- Reanimated 4 requires the New Architecture (mandatory since SDK 55) and
  `react-native-worklets` — both already configured; the Babel plugin is
  auto-wired by `babel-preset-expo`. Don't touch `babel.config.js` for it.
- Prefer layout/entering animations (`FadeInDown`, etc.) for lists; use
  `useAnimatedStyle` + `withTiming/withSpring` for interaction feedback.
- All animation math runs in worklets on the UI thread — never `setState`
  per frame.
- Respect `useReducedMotion()`; gate decorative motion behind it.
- Jest support comes from `setUpTests()` in `jest.setup.ts`.

## Typography

Inter via `@expo-google-fonts/inter`, loaded once in the root layout. Use
`AppText` variants (`display/title/body/caption/label`) — raw `<Text>` is
reserved for `shared/ui` internals. User-facing copy uses typographic
apostrophes (’) — docs-lint enforces. Details:
[../conventions/design-system.md](../conventions/design-system.md).
