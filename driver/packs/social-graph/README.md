# Pack: social-graph

Follow / followers — the edges that make a feed personal. Public-read graph (counts and lists are
visible), but you can only create or remove **your own** follow. Optimistic UI. Logic-first; UI is a
placeholder. **Key-free.**

## What you get

- `data/follow-repo.ts` — `follow`, `unfollow`, `isFollowing`, `followCounts` (followers + following).
- `useFollow(targetUserId)` — optimistic toggle + live follower count with rollback on failure.
- `FollowButton` — **placeholder** follow button.
- `supabase/0010_follows.sql` — `follows` edges, public-read RLS, self-only insert/delete, no
  self-follow.

## Install

```
/add-feature social-graph
# apply the migration, then:
supabase db reset && supabase test db
```

Use it:

```tsx
<FollowButton userId={profileId} />
// or headless:
const { following, followers, toggle } = useFollow(profileId);
```

## Security

The graph is **public read** so counts and follower lists render for everyone, but RLS guarantees a
user can only add an edge where `follower_id = auth.uid()` and remove only their own — nobody can make
someone else follow them, or force-unfollow on another's behalf. Combine with `feed-reels` (a
"following" feed = posts from people you follow) and `activity-inbox` (notify on a new follower).
