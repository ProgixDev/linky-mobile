// Public list of comments under a product/property listing. Top-level comments
// newest-first, each with its replies nested oldest-first (one thread level).
// Each comment carries likeCount + likedByMe (optional auth: a signed-in caller
// gets their like state; anonymous callers get false). No auth REQUIRED —
// matches the public discover feed.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { tryGetUser } from '@shared/auth.ts';

interface Body {
  listing_kind: 'product' | 'property';
  listing_id: string;
  limit?: number;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;
const KINDS = new Set(['product', 'property']);

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.listing_kind !== 'string' || !KINDS.has(x.listing_kind)) return false;
  if (typeof x.listing_id !== 'string' || !UUID_RE.test(x.listing_id)) return false;
  if (x.limit !== undefined && (typeof x.limit !== 'number' || x.limit < 1 || x.limit > 100)) return false;
  return true;
}

interface CommentRow {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  parent_id: string | null;
  like_count: number;
}
interface UserRow { id: string; display_name: string | null; avatar_url: string | null; }

Deno.serve(makePost<Body>('/v1/comments/list', valid, async ({ sb, body, req }) => {
  const limit = body.limit ?? 50;
  const callerId = await tryGetUser(req);

  // Pull ALL comments for the listing (top-level + replies) — replies are cheap
  // and nesting client-side needs the full set. The `limit` caps top-level
  // comments; replies ride along.
  const { data, error } = await sb
    .from('comments')
    .select('id, body, created_at, author_id, parent_id, like_count')
    .eq('listing_kind', body.listing_kind)
    .eq('listing_id', body.listing_id)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[list-comments] query error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  const rows = (data as CommentRow[] | null) ?? [];

  // Author identity — one batched query + Map (project convention).
  const byId = new Map<string, { displayName: string | null; avatarUrl: string | null }>();
  if (rows.length > 0) {
    const ids = [...new Set(rows.map((r) => r.author_id))];
    const { data: users } = await sb.from('users').select('id, display_name, avatar_url').in('id', ids);
    for (const u of (users as UserRow[] | null) ?? []) {
      byId.set(u.id, { displayName: u.display_name, avatarUrl: u.avatar_url });
    }
  }

  // likedByMe — one query for the caller's likes across this listing's comments.
  const likedSet = new Set<string>();
  if (callerId && rows.length > 0) {
    const commentIds = rows.map((r) => r.id);
    const { data: likes } = await sb
      .from('comment_likes')
      .select('comment_id')
      .eq('user_id', callerId)
      .in('comment_id', commentIds);
    for (const l of (likes as { comment_id: string }[] | null) ?? []) likedSet.add(l.comment_id);
  }

  const shape = (r: CommentRow) => ({
    id: r.id,
    body: r.body,
    createdAt: r.created_at,
    authorId: r.author_id,
    authorName: byId.get(r.author_id)?.displayName ?? null,
    authorAvatarUrl: byId.get(r.author_id)?.avatarUrl ?? null,
    parentId: r.parent_id,
    likeCount: Number(r.like_count),
    likedByMe: likedSet.has(r.id),
  });

  // Build the tree: top-level newest-first (already sorted desc), replies
  // oldest-first under each parent.
  const tops = rows.filter((r) => !r.parent_id).slice(0, limit).map(shape);
  const repliesByParent = new Map<string, ReturnType<typeof shape>[]>();
  for (const r of rows.filter((r) => r.parent_id)) {
    const arr = repliesByParent.get(r.parent_id!) ?? [];
    arr.push(shape(r));
    repliesByParent.set(r.parent_id!, arr);
  }
  const comments = tops.map((c) => ({
    ...c,
    // rows were desc; reverse the replies for this parent to get oldest-first.
    replies: (repliesByParent.get(c.id) ?? []).slice().reverse(),
  }));

  return { body: { comments } };
}));
