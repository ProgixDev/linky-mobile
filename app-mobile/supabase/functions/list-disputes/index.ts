// Admin Kanban backlog: all disputed orders awaiting a verdict.
//
// Auth: requireUser → assertAdmin. Non-admins receive 403 FORBIDDEN_ADMIN.
//
// Ordering: updated_at ASC (oldest waiting first = priority). dispute_order
// stamps updated_at = now() when flipping status to 'disputed', so on a fresh
// disputed order the row's updated_at IS effectively the "Litige ouvert"
// timestamp. V1 has no admin action that mutates a disputed order mid-flight,
// so updated_at stays a faithful proxy for "how long this dispute has waited".
// The dotted-namespace events[-1]->>'at' sort would be slightly more precise
// but PostgREST can't express it without a generated column or RPC — not
// worth the complexity for V1.
//
// Cursor: (updated_at, id) for stable forward pagination.
//
// Mapper: includeAdminMeta: true — admins see the full event log.
//         includeScanToken: false — admins don't ship packages.
//
// Stitching: orders contain buyer_id + seller_id only. We bulk-fetch the
// distinct ids once for display_name + primary email so the Kanban can render
// a participant chip without N+1 round-trips.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';
import { mapOrder, type OrderRow } from '@shared/catalog.ts';

interface Cursor { updated_at: string; id: string }
// Phase V.8 — include_resolved widens the result set to
// status IN ('disputed','refunded','released') with the cutoff applied to
// updated_at (the resolution stamps it via the RPC's update at the end of
// resolve_dispute). Admin Kanban defaults to 7 days so the
// "Remboursés" / "Libérés" columns aren't empty on first load.
interface IncludeResolved { since_days: number }
interface Body { limit?: number; cursor?: Cursor; include_resolved?: IncludeResolved }

// Phase V.2 -- anchored. See discover-feed for the rationale.
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

function validCursor(c: unknown): c is Cursor {
  if (typeof c !== 'object' || c === null) return false;
  const x = c as Record<string, unknown>;
  if (typeof x.updated_at !== 'string' || !ISO_RE.test(x.updated_at)) return false;
  if (typeof x.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(x.id)) return false;
  return true;
}

function validIncludeResolved(v: unknown): v is IncludeResolved {
  if (typeof v !== 'object' || v === null) return false;
  const x = v as Record<string, unknown>;
  if (typeof x.since_days !== 'number' || !Number.isFinite(x.since_days)) return false;
  // Cap : protects the index scan from a degenerate since_days request.
  if (x.since_days < 1 || x.since_days > 90) return false;
  return true;
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (x.limit !== undefined && (typeof x.limit !== 'number' || x.limit < 1 || x.limit > 100)) return false;
  if (x.cursor !== undefined && !validCursor(x.cursor)) return false;
  if (x.include_resolved !== undefined && !validIncludeResolved(x.include_resolved)) return false;
  return true;
}

interface ParticipantRow {
  id: string;
  display_name: string | null;
}

interface EmailRow {
  user_id: string;
  address: string;
}

Deno.serve(makePost<Body>('/v1/admin/disputes/list', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);
  await assertAdmin(sb, userId);

  const limit = body.limit ?? 50;

  let q = sb
    .from('orders')
    .select('id, reference, buyer_id, seller_id, shop_id, product_id, product_snapshot, quantity, amount_minor, fees_minor, total_minor, payment_method, currency, status, events, release_at, created_at, updated_at');

  // Phase V.8 -- widen the status filter when include_resolved is requested.
  // Logic : disputed orders ALWAYS show (no cutoff). Resolved orders
  // (refunded / released) only show if updated_at >= cutoff. The
  // resolve_dispute RPC stamps updated_at at the end of both branches, so
  // the cutoff is a faithful "resolved within the last N days" filter.
  // PostgREST .or() compound : status.eq.disputed OR (status IN
  // (refunded,released) AND updated_at >= cutoff).
  if (body.include_resolved) {
    const cutoff = new Date(Date.now() - body.include_resolved.since_days * 24 * 3600 * 1000).toISOString();
    q = q.or(`status.eq.disputed,and(status.in.(refunded,released),updated_at.gte.${cutoff})`);
  } else {
    q = q.eq('status', 'disputed');
  }

  if (body.cursor) {
    const { updated_at, id } = body.cursor;
    q = q.or(`updated_at.gt.${updated_at},and(updated_at.eq.${updated_at},id.gt.${id})`);
  }
  const { data: orderRows, error } = await q
    .order('updated_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit);
  if (error) {
    console.error('[list-disputes] query error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  const rows = (orderRows as (OrderRow & { updated_at: string })[] | null) ?? [];

  if (rows.length === 0) {
    return { body: { disputes: [], next_cursor: null } };
  }

  // Stitch participants in two bulk reads (users + their primary emails).
  const participantIds = Array.from(new Set(rows.flatMap((r) => [r.buyer_id, r.seller_id])));

  const { data: userRows, error: userErr } = await sb
    .from('users')
    .select('id, display_name')
    .in('id', participantIds);
  if (userErr) {
    console.error('[list-disputes] users select error:', userErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lecture participants');
  }

  const { data: emailRows, error: emailErr } = await sb
    .from('emails')
    .select('user_id, address')
    .in('user_id', participantIds)
    .eq('is_primary', true);
  if (emailErr) {
    console.error('[list-disputes] emails select error:', emailErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lecture emails');
  }

  const usersById = new Map<string, ParticipantRow>(
    ((userRows as ParticipantRow[] | null) ?? []).map((u) => [u.id, u]),
  );
  const emailsByUser = new Map<string, string>(
    ((emailRows as EmailRow[] | null) ?? []).map((e) => [e.user_id, e.address]),
  );

  function participant(uid: string) {
    const u = usersById.get(uid);
    return {
      id: uid,
      displayName: u?.display_name ?? undefined,
      email: emailsByUser.get(uid) ?? undefined,
    };
  }

  const disputes = rows.map((r) => ({
    order: mapOrder(r, { includeAdminMeta: true }),
    buyer: participant(r.buyer_id),
    seller: participant(r.seller_id),
  }));

  const next_cursor = rows.length === limit
    ? { updated_at: rows[rows.length - 1].updated_at, id: rows[rows.length - 1].id }
    : null;

  return { body: { disputes, next_cursor } };
}));
