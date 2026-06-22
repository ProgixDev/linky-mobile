# Features

One folder per product feature. Each feature is a vertical slice that owns its
UI, state and domain logic, and exposes a small public API via `index.ts`.

```
features/<name>/
├── index.ts        ← PUBLIC API (the only file outsiders may import)
├── ui/             ← screens + components (NativeWind, Reanimated)
├── model/          ← zustand store + zod schemas
├── lib/            ← pure helpers (no React)
└── __tests__/      ← jest + RNTL tests
```

Rules (lint-enforced — see `eslint.config.js`):

- Features may import `@/shared/*` and their own files. Never another
  feature's internals; if two features need each other, extract to `shared`
  or compose them at the route level.
- Routes in `src/app/` stay thin: they import a feature screen and nothing else.
- New feature? Run `npm run new:feature` and read
  [docs/architecture/module-boundaries.md](../../docs/architecture/module-boundaries.md).

The `tasks/` feature is the living reference — copy its structure.
