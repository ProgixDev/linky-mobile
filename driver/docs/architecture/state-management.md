# State Management

## Zustand 5 — the patterns we use

- One store per feature in `model/store.ts`, created with
  `create<State>()(...)` (note the curried call — required for TS inference).
- **Selectors always.** `useTasksStore(selectTasks)` — never
  `useTasksStore()` bare, which re-renders on every change. Export named
  selectors next to the store.
- Actions live inside the store and are the _only_ way to mutate. Actions
  validate input with the feature's Zod schemas and return result objects
  (`{ ok: true } | { ok: false; error }`) instead of throwing for expected
  failures.
- **No derived data in state.** Compute in selectors (`selectPendingCount`).
- Persistence uses `persist` + `createJSONStorage(() => AsyncStorage)` with a
  versioned key (`tasks-store-v1`) and a custom `merge` that Zod-validates
  rehydrated data — corrupt storage resets cleanly instead of crashing.
- Ephemeral UI state (an input draft, a modal flag) stays in `useState` in
  the component. If it survives navigation or is read by 2+ screens, it
  belongs in the store.

## Async/server data

The skeleton has no API layer yet by design. When you add one, follow the
ADR process first — the expected shape is: fetch in `features/X/lib/api.ts`
using global `fetch` (SDK 56's `expo/fetch` is WinterTC-compliant), parse the
response with Zod _before_ it touches the store, and consider TanStack Query
for caching when server state outgrows hand-rolled stores. Record the choice
in [decisions/](decisions/README.md).

## Testing stores

Reset between tests: capture `useStore.getState()` once, then
`useStore.setState(initial, true)` in `beforeEach`. Test actions as plain
functions via `getState()` — no React needed. See
`src/features/tasks/__tests__/store.test.ts`.
