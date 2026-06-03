// Phase L.6 — send a message (creates conversation if new pair+pinned context).
//
// Body : {
//   recipient_id?: string       // mode "new conv" — UUID of the other participant
//   conversation_id?: string    // mode "reply" — UUID of an existing conversation
//   pinned_kind?: 'product'|'property'|null
//   pinned_id?: string|null
//   body: string                // 1..2000 chars
// }
// Exactly one of recipient_id / conversation_id must be present (XOR).
// pinned_kind + pinned_id are both-or-neither.
//
// In reply mode the edge fn fetches the conv, asserts the caller is a
// participant, and derives recipient_id + pinned_kind/pinned_id from the
// conv (ignoring whatever was sent in the body — the conv's pinned wins).
// This guarantees the RPC lands the message in the SAME conv rather than
// creating a parallel one if the client accidentally sent a mismatched pinned.
//
// Response : { message: MessageItem, conversationId, isNewConversation }
// Mobile invalidates ['conversations'] + ['conversation', conv_id] which
// triggers refetch via list-conversations / get-conversation (those carry
// the full enriched snapshot).
//
// Errors mapped from RPC sqlstate :
//   cannot_message_self       → CANNOT_MESSAGE_SELF 400
//   recipient_not_found       → RECIPIENT_NOT_FOUND 404
//   invalid_pinned_pair/kind  → INVALID_PINNED 400
//   pinned_product_not_found  → PINNED_PRODUCT_NOT_FOUND 404
//   pinned_property_not_found → PINNED_PROPERTY_NOT_FOUND 404
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body {
  recipient_id?: string;
  conversation_id?: string;
  pinned_kind?: 'product' | 'property' | null;
  pinned_id?: string | null;
  body: string;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;
const MAX_BODY_LEN = 2000;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.body !== 'string') return false;
  if (x.body.trim().length === 0 || x.body.length > MAX_BODY_LEN) return false;

  const hasConvId = x.conversation_id !== undefined && x.conversation_id !== null;
  const hasRecipientId = x.recipient_id !== undefined && x.recipient_id !== null;
  if (hasConvId === hasRecipientId) return false;

  if (hasConvId && (typeof x.conversation_id !== 'string' || !UUID_RE.test(x.conversation_id))) return false;
  if (hasRecipientId && (typeof x.recipient_id !== 'string' || !UUID_RE.test(x.recipient_id))) return false;

  const hasPinnedKind = x.pinned_kind !== undefined && x.pinned_kind !== null;
  const hasPinnedId = x.pinned_id !== undefined && x.pinned_id !== null;
  if (hasPinnedKind !== hasPinnedId) return false;
  if (hasPinnedKind) {
    if (x.pinned_kind !== 'product' && x.pinned_kind !== 'property') return false;
    if (typeof x.pinned_id !== 'string' || !UUID_RE.test(x.pinned_id as string)) return false;
  }

  return true;
}

Deno.serve(makePost<Body>('/v1/messages/send', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  let recipientId: string;
  let pinnedKind: 'product' | 'property' | null = body.pinned_kind ?? null;
  let pinnedId: string | null = body.pinned_id ?? null;

  if (body.conversation_id) {
    const { data: conv, error: cErr } = await sb
      .from('conversations')
      .select('participant_a_id, participant_b_id, pinned_kind, pinned_id')
      .eq('id', body.conversation_id)
      .maybeSingle();

    if (cErr) {
      console.error('[send-message] conv select error:', cErr);
      throwApi('INTERNAL_ERROR', 500, 'Erreur lecture conversation.');
    }
    if (!conv) throwApi('CONVERSATION_NOT_FOUND', 404, 'Conversation introuvable.');
    if (conv.participant_a_id !== userId && conv.participant_b_id !== userId) {
      throwApi('FORBIDDEN', 403, 'Accès interdit à cette conversation.');
    }

    recipientId = conv.participant_a_id === userId ? conv.participant_b_id : conv.participant_a_id;
    pinnedKind = conv.pinned_kind;
    pinnedId = conv.pinned_id;
  } else {
    recipientId = body.recipient_id as string;
  }

  const { data: rpcResult, error: rpcErr } = await sb.rpc('send_message', {
    p_sender_id: userId,
    p_recipient_id: recipientId,
    p_body: body.body,
    p_pinned_kind: pinnedKind,
    p_pinned_id: pinnedId,
  });

  if (rpcErr) {
    const msg = (rpcErr as { message?: string }).message ?? '';
    if (msg.includes('cannot_message_self')) throwApi('CANNOT_MESSAGE_SELF', 400, 'Impossible d\'envoyer un message à soi-même.');
    if (msg.includes('recipient_not_found')) throwApi('RECIPIENT_NOT_FOUND', 404, 'Destinataire introuvable.');
    if (msg.includes('invalid_pinned_pair') || msg.includes('invalid_pinned_kind')) throwApi('INVALID_PINNED', 400, 'Référence d\'article invalide.');
    if (msg.includes('pinned_product_not_found')) throwApi('PINNED_PRODUCT_NOT_FOUND', 404, 'Article introuvable.');
    if (msg.includes('pinned_property_not_found')) throwApi('PINNED_PROPERTY_NOT_FOUND', 404, 'Bien immobilier introuvable.');
    console.error('[send-message] RPC error:', rpcErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lors de l\'envoi.');
  }

  const result = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
  if (!result) throwApi('INTERNAL_ERROR', 500, 'Erreur inattendue.');

  const { data: msgRow, error: msgErr } = await sb
    .from('messages')
    .select('id, conversation_id, sender_id, body, read_at, created_at')
    .eq('id', result.message_id)
    .single();

  if (msgErr || !msgRow) {
    console.error('[send-message] message select error:', msgErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lecture message.');
  }

  return {
    body: {
      message: {
        id: msgRow.id,
        conversationId: msgRow.conversation_id,
        senderId: msgRow.sender_id,
        body: msgRow.body,
        at: msgRow.created_at,
        seen: msgRow.read_at !== null,
      },
      conversationId: result.conversation_id,
      isNewConversation: result.is_new_conversation === true,
    },
  };
}));
