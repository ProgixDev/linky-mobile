# Pack: offline-sync

The thing that makes an app feel solid on a flaky connection: **network-state awareness** plus a
**persisted optimistic mutation queue** that replays writes when connectivity returns — instead of
throwing an error the moment the user is on the subway. **Key-free.** Primitive — no route.

## What you get

- `useNetworkState()` — `{ isOnline }`, true only when the internet is actually reachable (not just
  "connected to wifi").
- `mutation-queue.ts` — `registerMutation(type, run)`, `enqueueMutation(type, payload)`,
  `drainQueue()`, `pendingCount()`. The queue is persisted (AsyncStorage via `@/shared/lib/storage`)
  so it survives app restarts, retries with a cap, and drops poison items after 5 attempts.
- `useOfflineQueue()` — mount once near the root: tracks pending count and auto-drains on reconnect.

## Install

```
/add-feature offline-sync
npx expo install @react-native-community/netinfo
```

Pattern — apply the change optimistically, queue the write:

```ts
// once at startup
registerMutation('like.toggle', async ({ postId }) => {
  await supabase.from('post_likes').insert({ post_id: postId });
});

// in the UI handler
setLiked(true);                                   // optimistic
await enqueueMutation('like.toggle', { postId }); // runs now if online, else on reconnect
```

```tsx
// near the root
const { isOnline, pending } = useOfflineQueue();
{!isOnline && pending > 0 ? <Banner>{pending} changes will sync</Banner> : null}
```

## Notes

Only queue **idempotent or naturally-deduped** writes (an RLS unique constraint, an upsert) so a
replay can't double-apply. Never queue anything that must be transactional or strictly ordered across
types. Pairs with `feed-reels` (likes), `comments`, and any create action.
