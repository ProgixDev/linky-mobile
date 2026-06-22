# Pack: feed-reels

A TikTok-style **vertical video feed** — paginated query, autoplay-on-visible player, and likes.
Backend + logic are fully wired (Supabase, **key-free**); the UI is a placeholder.

## What you get

- **Migration** (`supabase/0010_feed.sql`): `posts` + `post_likes` with **RLS** — posts are public
  read (it's a feed), writes are owner-scoped; likes are owner-scoped.
- `data/feed-repo.ts` — `getFeed(cursor)` (paginated, newest-first, with `likeCount` + `likedByMe`),
  `toggleLike`, `createPost`.
- `useFeed()` → `{ posts, loading, refreshing, activeIndex, setActiveIndex, loadMore, refresh, like }`
  — cursor pagination, pull-to-refresh, **optimistic** likes with revert, and the active index so the
  UI plays only the on-screen video.
- `FeedScreen` — a **placeholder** vertical pager (one video per page, autoplay on visible) proving it.

## Install

```
/add-feature feed-reels
# apply supabase/0010_feed.sql into supabase/migrations/, then:
supabase db reset && supabase test db
npx expo install expo-video
```

Requires the **auth** from Phase 2. Publish + read:

```ts
await createPost('https://…/clip.mp4', 'first post'); // video already uploaded
const { posts } = useFeed(); // paginated feed with like state
```

## Videos / storage

`posts.video_url` is any https URL. For user uploads, add a **private Supabase Storage bucket** with
a per-user folder policy + short-lived signed URLs (copy the storage pattern in
`docs/research/03-supabase-security.md`), then pass the URL to `createPost`.

## Performance note

The placeholder creates one `expo-video` player per item — fine to demo. In the design pass, window
the players (keep ~3 around the active index) for long feeds.

## Extend

Comments (a `post_comments` table, same owner-scoped pattern), follows (a `follows` table + a
"following" feed query), share, and a creator profile overlay all drop onto `useFeed`.
