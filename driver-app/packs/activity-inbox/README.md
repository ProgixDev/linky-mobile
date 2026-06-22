# Pack: activity-inbox

The notification bell and the list behind it: an **in-app** notification feed with an unread badge,
tap-to-read, mark-all-read, and **realtime** arrival. Owner-scoped RLS. Logic-first; UI is a
placeholder. **Key-free.**

> Different from `push-notifications`: push **delivers** the buzz to the device; this **shows the
> history** inside the app. Most apps want both.

## What you get

- `data/notifications-repo.ts` — `listNotifications`, `unreadCount`, `markRead`, `markAllRead`, and
  `notify(targetUserId, type, body, entity?)` to create one when something happens.
- `useInbox()` — loads list + unread count, subscribes to Realtime so new ones appear live.
- `InboxScreen` — **placeholder** inbox.
- `supabase/0010_notifications.sql` — `notifications` table, owner-read RLS, actor-stamped insert,
  Realtime publication.

## Install

```
/add-feature activity-inbox
# apply the migration, then:
supabase db reset && supabase test db
```

Create notifications from your features:

```ts
// when user B likes user A's post:
await notify(postOwnerId, 'like', 'Someone liked your post', `/post/${postId}`);
```

## Security

A user **reads only their own** notifications and can mark only their own read. A client-created
notification must be **stamped with the actor = the caller** (so "X liked your post" can only be
forged-proof: only X can create it as X). System notifications should be inserted server-side with
the service_role. The `entity` deep-link should be validated through the deep-link gate before
navigation. Pairs with `social-graph`, `comments`, `feed-reels`, and `push-notifications`.
