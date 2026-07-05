// Public list of comments under a product or property listing, newest first.
// No auth required — matches the public discover feed (anyone can read a thread).
// Author name + avatar are looked up in a second batched query + Map (project
// convention; see list-shop-reviews). Response keys are camelCase.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';

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

interface CommentRow { id: string; body: string; created_at: string; author_id: string; }
interface UserRow { id: string; display_name: string | null; avatar_url: string | null; }

Deno.serve(makePost<Body>('/v1/comments/list', valid, async ({ sb, body }) => {
  const limit = body.limit ?? 50;

  const { data, error } = await sb
    .from('comments')
    .select('id, body, created_at, author_id')
    .eq('listing_kind', body.listing_kind)
    .eq('listing_id', body.listing_id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[list-comments] query error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  const rows = (data as CommentRow[] | null) ?? [];

  // Second batched query for author identity — one FK to users, but we follow
  // the reviews convention (explicit Map, not a PostgREST embed).
  const byId = new Map<string, { displayName: string | null; avatarUrl: string | null }>();
  if (rows.length > 0) {
    const ids = [...new Set(rows.map((r) => r.author_id))];
    const { data: users } = await sb.from('users').select('id, display_name, avatar_url').in('id', ids);
    for (const u of (users as UserRow[] | null) ?? []) {
      byId.set(u.id, { displayName: u.display_name, avatarUrl: u.avatar_url });
    }
  }

  const comments = rows.map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.created_at,
    authorId: r.author_id,
    authorName: byId.get(r.author_id)?.displayName ?? null,
    authorAvatarUrl: byId.get(r.author_id)?.avatarUrl ?? null,
  }));

  return { body: { comments } };
}));
