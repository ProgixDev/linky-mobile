// Phase O.2 — list the caller's notifications, newest first.
//
// Body : { cursor?: { created_at, id }, limit? }
// Response : {
//   notifications: NotificationRow[],
//   next_cursor: { created_at, id } | null,
//   unread_count: number   // read_at IS NULL total for the caller (not page-scoped)
// }
//
// Auth : requireUser. Keyset pagination on (created_at DESC, id DESC) —
// same cursor shape as list-conversations (L.4).
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Cursor { created_at: string; id: string }
interface Body { limit?: number; cursor?: Cursor; app?: 'driver' | 'marketplace' }

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
// Anchored end-to-end : the cursor value is interpolated into a PostgREST
// .or() filter string, so trailing garbage must not pass validation.
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
const UUID_RE = /^[0-9a-f-]{36}$/i;

function validCursor(c: unknown): c is Cursor {
  if (typeof c !== 'object' || c === null) return false;
  const x = c as Record<string, unknown>;
  if (typeof x.created_at !== 'string' || !ISO_RE.test(x.created_at)) return false;
  if (typeof x.id !== 'string' || !UUID_RE.test(x.id)) return false;
  return true;
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (x.limit !== undefined && (typeof x.limit !== 'number' || x.limit < 1 || x.limit > MAX_LIMIT)) return false;
  if (x.cursor !== undefined && x.cursor !== null && !validCursor(x.cursor)) return false;
  if (x.app !== undefined && x.app !== 'driver' && x.app !== 'marketplace') return false;
  return true;
}

interface NotificationRow {
  id: string;
  category: string;
  title: string;
  body: string;
  icon_hint: string;
  deeplink: string | null;
  ref_type: string | null;
  ref_id: string | null;
  read_at: string | null;
  created_at: string;
}

Deno.serve(makePost<Body>('/v1/notifications/list', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);
  const limit = Math.min(Math.max(body.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  let q = sb
    .from('notifications')
    .select('id, category, title, body, icon_hint, deeplink, ref_type, ref_id, read_at, created_at')
    .eq('user_id', userId);

  // Scope to the calling app: the driver app sends app:'driver' and sees ONLY
  // delivery notifications; the marketplace app sends nothing and excludes them.
  if (body.app === 'driver') q = q.eq('app', 'driver');
  else q = q.neq('app', 'driver');

  if (body.cursor) {
    q = q.or(
      `created_at.lt.${body.cursor.created_at},and(created_at.eq.${body.cursor.created_at},id.lt.${body.cursor.id})`,
    );
  }

  const { data: rows, error: qErr } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  if (qErr) {
    console.error('[list-notifications] query error:', qErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur chargement notifications.');
  }
  const all = (rows as NotificationRow[] | null) ?? [];

  const hasMore = all.length > limit;
  const items = hasMore ? all.slice(0, limit) : all;

  let cq = sb
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);
  if (body.app === 'driver') cq = cq.eq('app', 'driver');
  else cq = cq.neq('app', 'driver');
  const { count, error: cErr } = await cq;
  if (cErr) {
    console.error('[list-notifications] unread count error:', cErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur chargement notifications.');
  }

  const next_cursor = hasMore && items.length > 0
    ? { created_at: items[items.length - 1].created_at, id: items[items.length - 1].id }
    : null;

  return { body: { notifications: items, next_cursor, unread_count: count ?? 0 } };
}));
