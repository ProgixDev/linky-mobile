// Phase L.4 — list a user's conversations, ordered by last activity desc.
//
// Body  : { cursor?: { last_message_at, id }, limit? }
// Response : { conversations: ConvListItem[], next_cursor: { last_message_at, id } | null }
//
// Auth  : requireUser → caller's user_id determines:
//   - which side of (a, b) they are
//   - which unread counter is theirs
//   - which participant is the "other" for display purposes
//
// Pinned listing snapshot is intentionally NOT stitched here (defer to
// get-conversation L.5). The list view only renders other-user + last
// message + timestamp + unread badge — no pinned card.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Cursor { last_message_at: string; id: string }
interface Body { limit?: number; cursor?: Cursor }

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
// Phase V.2 -- anchored. See discover-feed for the rationale.
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
const UUID_RE = /^[0-9a-f-]{36}$/i;

function validCursor(c: unknown): c is Cursor {
  if (typeof c !== 'object' || c === null) return false;
  const x = c as Record<string, unknown>;
  if (typeof x.last_message_at !== 'string' || !ISO_RE.test(x.last_message_at)) return false;
  if (typeof x.id !== 'string' || !UUID_RE.test(x.id)) return false;
  return true;
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (x.limit !== undefined && (typeof x.limit !== 'number' || x.limit < 1 || x.limit > MAX_LIMIT)) return false;
  if (x.cursor !== undefined && x.cursor !== null && !validCursor(x.cursor)) return false;
  return true;
}

interface ConvRow {
  id: string;
  participant_a_id: string;
  participant_b_id: string;
  pinned_kind: 'product' | 'property' | null;
  pinned_id: string | null;
  last_message_text: string | null;
  last_message_at: string | null;
  last_message_sender_id: string | null;
  unread_a: number;
  unread_b: number;
}

interface UserRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface ConvListItem {
  id: string;
  participants: [string, string];
  otherUserId: string;
  otherUserDisplayName: string | null;
  otherUserAvatarUrl: string | null;
  pinnedListingId: string | null;
  pinnedListingKind: 'product' | 'property' | null;
  lastMessage: string | null;
  lastAt: string | null;
  lastMessageSenderId: string | null;
  unread: number;
}

Deno.serve(makePost<Body>('/v1/conversations/list', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);
  const limit = Math.min(Math.max(body.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  let q = sb
    .from('conversations')
    .select(
      'id, participant_a_id, participant_b_id, pinned_kind, pinned_id, last_message_text, last_message_at, last_message_sender_id, unread_a, unread_b',
    )
    .or(`participant_a_id.eq.${userId},participant_b_id.eq.${userId}`)
    .not('last_message_at', 'is', null);

  if (body.cursor) {
    q = q.or(
      `last_message_at.lt.${body.cursor.last_message_at},and(last_message_at.eq.${body.cursor.last_message_at},id.lt.${body.cursor.id})`,
    );
  }

  const { data: rows, error: qErr } = await q
    .order('last_message_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  if (qErr) {
    console.error('[list-conversations] query error:', qErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur chargement conversations.');
  }
  const all = (rows as ConvRow[] | null) ?? [];

  const hasMore = all.length > limit;
  const items = hasMore ? all.slice(0, limit) : all;

  const otherIds = Array.from(new Set(
    items.map((c) => (c.participant_a_id === userId ? c.participant_b_id : c.participant_a_id)),
  ));

  const usersMap = new Map<string, { display_name: string | null; avatar_url: string | null }>();
  if (otherIds.length > 0) {
    const { data: users, error: uErr } = await sb
      .from('users')
      .select('id, display_name, avatar_url')
      .in('id', otherIds);
    if (uErr) {
      console.error('[list-conversations] users stitch error:', uErr);
      throwApi('INTERNAL_ERROR', 500, 'Erreur lecture participants.');
    }
    for (const u of (users as UserRow[] | null) ?? []) {
      usersMap.set(u.id, { display_name: u.display_name, avatar_url: u.avatar_url });
    }
  }

  const conversations: ConvListItem[] = items.map((c) => {
    const isA = c.participant_a_id === userId;
    const other = isA ? c.participant_b_id : c.participant_a_id;
    const ou = usersMap.get(other);
    return {
      id: c.id,
      participants: [c.participant_a_id, c.participant_b_id],
      otherUserId: other,
      otherUserDisplayName: ou?.display_name ?? null,
      otherUserAvatarUrl: ou?.avatar_url ?? null,
      pinnedListingId: c.pinned_id,
      pinnedListingKind: c.pinned_kind,
      lastMessage: c.last_message_text,
      lastAt: c.last_message_at,
      lastMessageSenderId: c.last_message_sender_id,
      unread: isA ? c.unread_a : c.unread_b,
    };
  });

  const next_cursor = hasMore && items.length > 0
    ? { last_message_at: items[items.length - 1].last_message_at!, id: items[items.length - 1].id }
    : null;

  return { body: { conversations, next_cursor } };
}));
