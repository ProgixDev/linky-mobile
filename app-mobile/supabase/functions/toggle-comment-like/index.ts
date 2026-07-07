// Like / unlike a comment. Authed. Idempotent per (comment, user): calling it
// toggles. Delegates to toggle_comment_like (row-locked, count recomputed from
// comment_likes → drift-proof). Returns the new { liked, likeCount }.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body { comment_id: string }

const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  return typeof x.comment_id === 'string' && UUID_RE.test(x.comment_id);
}

Deno.serve(makePost<Body>('/v1/comments/like', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const { data, error } = await sb.rpc('toggle_comment_like', {
    p_comment_id: body.comment_id,
    p_user_id: userId,
  });
  if (error) {
    if ((error.message ?? '').includes('comment_not_found')) {
      throwApi('COMMENT_NOT_FOUND', 404, 'Commentaire introuvable.');
    }
    console.error('[toggle-comment-like] rpc error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  // RPC returns a single row { liked, like_count }.
  const row = Array.isArray(data) ? data[0] : data;
  return {
    body: {
      liked: !!row?.liked,
      likeCount: Number(row?.like_count ?? 0),
    },
  };
}));
