# Pack template

Copy this folder to `packs/<name>/` to start a new feature pack. A pack is **logic-first**: ship
the working background (data layer, state, services, realtime, migrations, hooks) and a **minimal,
swappable** UI. See [`../README.md`](../README.md) for the philosophy.

## Structure

```
packs/<name>/
├── pack.json          # manifest (see _TEMPLATE/pack.json) — deps, env, migrations, routes
├── README.md          # what it does · how it's separated · what keys to ship · how to test
├── src/               # copied into src/features/<name>/ on install
│   ├── model/schema.ts    # Zod schema + types (validation at the edges)
│   ├── data/*.ts          # data layer: Supabase queries / API clients / realtime channels
│   ├── *-service.ts       # logic/services — KEY-FREE in dev (mock / free tier / sandbox)
│   ├── use-*.ts           # hooks the UI consumes
│   ├── ui/*.tsx           # MINIMAL placeholder UI — tag every screen `// DESIGN: replace after Claude Design`
│   └── index.ts           # public API (the feature's barrel)
└── supabase/*.sql     # RLS-first migrations the pack needs (if any)
```

## Rules a pack must follow

- **Key-free dev**: works with no API keys (free API / sandbox / mock). List real keys in `pack.json`.
- **Secure**: RLS-first migrations (deny-by-default, owner-scoped); Zod at every edge; secrets
  server-side only; storage via `@/shared/lib/storage`.
- **Self-contained**: imports only `@/shared/*` and its own folder — no cross-feature imports.
- **UI is disposable**: the placeholder UI exists so the logic is demonstrable; the design pass
  replaces it. Keep it token-driven (shared `ui` primitives), no hardcoded hex.
- **Tested logic**: services/stores have unit tests (they run once installed into `src/`).
