// Phase L.7 — mark all incoming unread messages of a conversation as read,
// reset the caller's side unread counter to 0.
//
// Body : { conversation_id: string }
// Response : { marked_count: number }
//
// Auth : requireUser. The RPC (L.3) enforces participant check via row lock
// + sqlstate raise, so no JS-level participant assertion needed here.
//
// Errors mapped from RPC sqlstate :
//   conversation_not_found  → CONVERSATION_NOT_FOUND 404
//   not_a_participant       → FORBIDDEN 403
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body {
  conversation_id: string;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  return typeof x.conversation_id === 'string' && UUID_RE.test(x.conversation_id);
}

Deno.serve(makePost<Body>('/v1/messages/conversation/mark-read', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const { data: rpcResult, error: rpcErr } = await sb.rpc('mark_conversation_read', {
    p_user_id: userId,
    p_conversation_id: body.conversation_id,
  });

  if (rpcErr) {
    const msg = (rpcErr as { message?: string }).message ?? '';
    if (msg.includes('conversation_not_found')) throwApi('CONVERSATION_NOT_FOUND', 404, 'Conversation introuvable.');
    if (msg.includes('not_a_participant')) throwApi('FORBIDDEN', 403, 'Accès interdit à cette conversation.');
    console.error('[mark-read] RPC error:', rpcErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lors du marquage.');
  }

  const result = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
  return {
    body: {
      marked_count: result?.marked_count ?? 0,
    },
  };
}));
