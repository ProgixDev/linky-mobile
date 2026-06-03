// Phase L.5 — fetch one conversation + paginated messages (newest first) + pinned listing snapshot.
//
// Body : { conversation_id, before?: { created_at, id }, limit? }
// Response : { conversation: ConvDetailItem, messages: MessageItem[], next_cursor: { created_at, id } | null }
//
// Auth : requireUser → assert caller is participant_a or participant_b. Non-participants get 403.
//
// Pinned listing snapshot is stitched here (deferred from list-conversations).
// - Products: inline photos text[] → photos[1] (Postgres 1-indexed array → JS [0])
// - Properties: separate property_photos table → first by position
//
// Messages cursor: (created_at desc, id desc). 'before' = exclusive upper bound for "older messages".
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Cursor { created_at: string; id: string }
interface Body {
  conversation_id: string;
  before?: Cursor | null;
  limit?: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.conversation_id !== 'string' || !UUID_RE.test(x.conversation_id)) return false;
  if (x.before !== undefined && x.before !== null) {
    if (typeof x.before !== 'object') return false;
    const c = x.before as Record<string, unknown>;
    if (typeof c.created_at !== 'string') return false;
    if (typeof c.id !== 'string' || !UUID_RE.test(c.id)) return false;
  }
  if (x.limit !== undefined && (typeof x.limit !== 'number' || x.limit < 1)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/messages/conversation/get', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);
  const limit = Math.min(Math.max(body.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  const { data: conv, error: cErr } = await sb
    .from('conversations')
    .select('id, participant_a_id, participant_b_id, pinned_kind, pinned_id')
    .eq('id', body.conversation_id)
    .maybeSingle();

  if (cErr) {
    console.error('[get-conversation] conv select error:', cErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lecture conversation.');
  }
  if (!conv) throwApi('CONVERSATION_NOT_FOUND', 404, 'Conversation introuvable.');

  if (conv.participant_a_id !== userId && conv.participant_b_id !== userId) {
    throwApi('FORBIDDEN', 403, 'Accès interdit à cette conversation.');
  }

  const otherUserId = conv.participant_a_id === userId ? conv.participant_b_id : conv.participant_a_id;

  const { data: otherUser } = await sb
    .from('users')
    .select('display_name, avatar_url')
    .eq('id', otherUserId)
    .maybeSingle();

  let pinnedTitle: string | null = null;
  let pinnedPhotoUrl: string | null = null;
  let pinnedPriceGnf: number | null = null;

  if (conv.pinned_kind === 'product' && conv.pinned_id) {
    const { data: p } = await sb
      .from('products')
      .select('title, price_minor, photos')
      .eq('id', conv.pinned_id)
      .maybeSingle();
    if (p) {
      pinnedTitle = p.title;
      pinnedPriceGnf = p.price_minor != null ? Number(p.price_minor) : null;
      const photos = (p.photos ?? []) as string[];
      pinnedPhotoUrl = photos.length > 0 ? photos[0] : null;
    }
  } else if (conv.pinned_kind === 'property' && conv.pinned_id) {
    const { data: p } = await sb
      .from('properties')
      .select('title, price_minor')
      .eq('id', conv.pinned_id)
      .maybeSingle();
    if (p) {
      pinnedTitle = p.title;
      pinnedPriceGnf = p.price_minor != null ? Number(p.price_minor) : null;
    }
    const { data: photo } = await sb
      .from('property_photos')
      .select('url')
      .eq('property_id', conv.pinned_id)
      .order('position', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (photo) pinnedPhotoUrl = photo.url;
  }

  let mq = sb
    .from('messages')
    .select('id, conversation_id, sender_id, body, read_at, created_at')
    .eq('conversation_id', conv.id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  if (body.before && body.before.created_at && body.before.id) {
    mq = mq.or(
      `created_at.lt.${body.before.created_at},and(created_at.eq.${body.before.created_at},id.lt.${body.before.id})`,
    );
  }

  const { data: msgRows, error: mErr } = await mq;
  if (mErr) {
    console.error('[get-conversation] messages select error:', mErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lecture messages.');
  }

  const msgs = (msgRows ?? []) as Array<{
    id: string;
    conversation_id: string;
    sender_id: string;
    body: string;
    read_at: string | null;
    created_at: string;
  }>;
  const hasMore = msgs.length > limit;
  const messageItems = hasMore ? msgs.slice(0, limit) : msgs;

  const messages = messageItems.map((m) => ({
    id: m.id,
    conversationId: m.conversation_id,
    senderId: m.sender_id,
    body: m.body,
    at: m.created_at,
    seen: m.read_at !== null,
  }));

  const nextCursor = hasMore && messageItems.length > 0
    ? {
        created_at: messageItems[messageItems.length - 1].created_at,
        id: messageItems[messageItems.length - 1].id,
      }
    : null;

  return {
    body: {
      conversation: {
        id: conv.id,
        participants: [conv.participant_a_id, conv.participant_b_id],
        otherUserId,
        otherUserDisplayName: otherUser?.display_name ?? null,
        otherUserAvatarUrl: otherUser?.avatar_url ?? null,
        pinnedListingId: conv.pinned_id,
        pinnedListingKind: conv.pinned_kind,
        pinnedListingTitle: pinnedTitle,
        pinnedListingPhotoUrl: pinnedPhotoUrl,
        pinnedListingPriceGnf: pinnedPriceGnf,
      },
      messages,
      next_cursor: nextCursor,
    },
  };
}));
