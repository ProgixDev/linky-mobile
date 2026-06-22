# Pack: comments

Reusable **threaded comments** on any entity — a post, a reel, a product. Polymorphic
`(entity_type, entity_id)` target, one level of replies, paginated, optimistic add. Public read;
write/delete only your own. Logic-first; UI is a placeholder. **Key-free.**

## What you get

- `data/comments-repo.ts` — `listComments` (cursor-paginated), `addComment` (+ reply), `deleteComment`.
- `useComments(entityType, entityId)` — load-more, optimistic post (reconciled with the real row),
  optimistic delete with rollback.
- `CommentsScreen` — **placeholder** thread.
- `supabase/0010_comments.sql` — `comments` table, public-read RLS, self-only insert/delete, indexes
  on the entity + parent.

## Install

```
/add-feature comments
# apply the migration, then:
supabase db reset && supabase test db
```

Attach to anything:

```tsx
<CommentsScreen entityType="post" entityId={postId} />
// or headless:
const { comments, post } = useComments('reel', reelId);
```

## Security

Comments are **public read** but RLS allows insert only as `user_id = auth.uid()` and delete only of
your own rows — no impersonation, no deleting other people's comments. Body length is bounded in the
DB (matched by the Zod input) so a client can't store a giant payload. Pairs with `feed-reels`,
`activity-inbox` (notify on a reply), and `social-graph`.
