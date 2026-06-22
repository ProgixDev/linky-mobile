# Navigation (expo-router)

## SDK 56 reality check

`expo-router` has **forked from react-navigation**. Importing anything from
`@react-navigation/*` is a lint error in this repo — every navigation API you
need is exported from `expo-router`.

## Conventions

- Routes live in `src/app/`. **Routes are wiring only**: import a feature
  screen, render it, done. A route file longer than ~20 lines is a smell.
- Typed routes are enabled (`experiments.typedRoutes`) — `href` strings are
  type-checked. Run the dev server once after adding routes to regenerate
  types.
- File naming: `_layout.tsx` for stacks/tabs, `+not-found.tsx` for 404,
  `[param].tsx` for dynamic segments, `(group)/` for groups that don't affect
  the URL.
- **Never put test files inside `src/app/`** — the router would treat them as
  routes. Tests live in the feature's `__tests__/`.
- Deep links: the scheme is `skeleton://` (see `app.config.ts`). Document
  every user-facing deep link in the feature's PRD and add a Maestro step
  (`openLink`) covering it.
- Screen-level navigation options are set in the route file via
  `<Stack.Screen options={…}>`, not inside feature UI — features must stay
  navigation-agnostic (they receive params as props if needed).

## Adding a screen — checklist

1. `npm run new:feature -- <name>` (or reuse an existing feature).
2. Add `src/app/<path>.tsx` rendering the feature screen.
3. If it's part of a critical journey, update
   [../quality/critical-user-journeys.md](../quality/critical-user-journeys.md)
   and add/extend a Maestro flow.
