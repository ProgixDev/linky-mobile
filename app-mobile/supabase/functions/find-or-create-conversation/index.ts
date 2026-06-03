// Phase N.1 — Find or create a conversation (without sending a message).
// Used by the "Chat with seller" button on product/property detail pages.
//
// Body : { recipient_id, pinned_kind?, pinned_id? }
// Response : { conversation_id, is_new_conversation }

import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body {
  recipient_id: string;
  pinned_kind?: 'product' | 'property' | null;
  pinned_id?: string | null;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.recipient_id !== 'string' || !UUID_RE.test(x.recipient_id)) return false;
  const hasPinnedKind = x.pinned_kind !== undefined && x.pinned_kind !== null;
  const hasPinnedId = x.pinned_id !== undefined && x.pinned_id !== null;
  if (hasPinnedKind !== hasPinnedId) return false;
  if (hasPinnedKind) {
    if (x.pinned_kind !== 'product' && x.pinned_kind !== 'property') return false;
    if (typeof x.pinned_id !== 'string' || !UUID_RE.test(x.pinned_id as string)) return false;
  }
  return true;
}

Deno.serve(makePost<Body>('/v1/messages/find-or-create', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const { data: rpcResult, error: rpcErr } = await sb.rpc('find_or_create_conversation', {
    p_user_id: userId,
    p_recipient_id: body.recipient_id,
    p_pinned_kind: body.pinned_kind ?? null,
    p_pinned_id: body.pinned_id ?? null,
  });

  if (rpcErr) {
    const msg = (rpcErr as { message?: string }).message ?? '';
    if (msg.includes('cannot_message_self')) throwApi('CANNOT_MESSAGE_SELF', 400, 'Impossible de discuter avec soi-même.');
    if (msg.includes('recipient_not_found')) throwApi('RECIPIENT_NOT_FOUND', 404, 'Destinataire introuvable.');
    if (msg.includes('invalid_pinned_pair') || msg.includes('invalid_pinned_kind')) throwApi('INVALID_PINNED', 400, 'Référence d\'article invalide.');
    if (msg.includes('pinned_product_not_found')) throwApi('PINNED_PRODUCT_NOT_FOUND', 404, 'Article introuvable.');
    if (msg.includes('pinned_property_not_found')) throwApi('PINNED_PROPERTY_NOT_FOUND', 404, 'Bien immobilier introuvable.');
    console.error('[find-or-create-conversation] RPC error:', rpcErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lors de l\'ouverture de la conversation.');
  }

  const result = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
  if (!result) throwApi('INTERNAL_ERROR', 500, 'Erreur inattendue.');

  return {
    body: {
      conversation_id: result.conversation_id,
      is_new_conversation: result.is_new_conversation === true,
    },
  };
}));
