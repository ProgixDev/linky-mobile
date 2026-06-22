# Code Style

Prettier formats; ESLint judges; this doc covers what tools can't.

## TypeScript

- `strict` + `noUncheckedIndexedAccess` are on — handle the `undefined`.
- `any` requires a `// why:` comment on the same line; prefer `unknown` +
  narrowing or a Zod parse.
- Types from schemas: `type Task = z.infer<typeof TaskSchema>` — never write a
  domain type by hand twice.
- Named exports only (the single exception: route files in `src/app/` and
  config files require default exports).
- File names: kebab-case (`tasks-screen.tsx`); component exports: PascalCase;
  hooks: `useX`; selectors: `selectX`; schemas: `XSchema`.
- Functions stay small and intention-named. Early returns over nesting.
  No `// TODO` without an issue link.

## Imports

Path alias `@/*` → `src/*`. Order (Prettier doesn't enforce; reviewers do):

1. react/react-native, 2. external packages, 3. `@/shared/...`,
2. feature-relative. Respect the [boundaries](../architecture/module-boundaries.md) —
   the linter will anyway.

## Errors

- Expected failures return result objects (`{ ok: false, error }`); throwing
  is reserved for programmer errors and startup invariants (e.g. invalid env).
- Every `catch` either handles meaningfully or rethrows with context — no
  silent swallows, no bare `console.log` left behind (use `console.warn/error`
  with a prefix where genuinely useful).

## Comments

Comment _why_, not _what_. Public APIs of features and shared modules get a
JSDoc block stating the contract (see `src/shared/lib/env.ts` for tone).
Keep comments truthful — a stale comment is a bug; fix it in the same PR.
