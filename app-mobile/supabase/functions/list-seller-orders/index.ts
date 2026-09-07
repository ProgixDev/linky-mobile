// Caller's own orders as seller — mirror of list-my-orders but scoped to
// seller_id derived from the caller's JWT (never from the request body).
//
// CE POINT D'ENTREE NE REND PLUS scan_token (2026-09-07). Il le rendait sans
// condition, pour un usage qui n'existe plus : le vendeur imprimait le QR sur
// le colis. Depuis l'inversion du 2026-08-22, c'est l'ACHETEUR qui affiche le
// QR et le vendeur qui le SCANNE — plus aucun ecran vendeur ne lit ce champ.
//
// Le laisser sortait un secret pour rien, et pas un secret anodin :
// seller_confirm_pickup libere le sequestre sur la seule presentation du bon
// scan_token. Un vendeur pouvait donc le lire ici et s'auto-payer sans que
// l'acheteur ait rien recu. Le verrou n'a de sens que si le token ne
// s'obtient QU'A LA CAMERA, en presence de l'acheteur.
//
// Defense-in-depth (per project_list_seller_orders_scan_token_defense memo):
//   1. seller_id is set from requireUser(req) — same posture as place-order;
//      a caller can never spoof another seller's orders by manipulating body.
//   2. Le SELECT ne ramene plus scan_token du tout : ce qui ne quitte pas la
//      base ne peut pas fuiter.
//   3. V1.1 follow-up: integration test where a buyer JWT calls this endpoint
//      must return 0 orders (seller_id = buyer's user id will match no rows
//      unless the buyer has also sold something, which is fine). The
//      query-level filter is the load-bearing guard, not auth on input.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { mapOrder, type OrderRow } from '@shared/catalog.ts';

interface Cursor { created_at: string; id: string }
interface Body { status?: string; limit?: number; cursor?: Cursor }

const STATUSES = new Set(['placed', 'paid', 'preparing', 'delivered', 'released', 'disputed']);
// Phase V.2 -- anchored. See discover-feed for the rationale.
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

function validCursor(c: unknown): c is Cursor {
  if (typeof c !== 'object' || c === null) return false;
  const x = c as Record<string, unknown>;
  if (typeof x.created_at !== 'string' || !ISO_RE.test(x.created_at)) return false;
  if (typeof x.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(x.id)) return false;
  return true;
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (x.status !== undefined && (typeof x.status !== 'string' || !STATUSES.has(x.status as string))) return false;
  if (x.limit !== undefined && (typeof x.limit !== 'number' || x.limit < 1 || x.limit > 100)) return false;
  if (x.cursor !== undefined && !validCursor(x.cursor)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/orders/list-seller', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);
  const limit = body.limit ?? 50;
  let q = sb
    .from('orders')
    .select('id, reference, buyer_id, seller_id, shop_id, product_id, product_snapshot, quantity, amount_minor, fees_minor, total_minor, payment_method, currency, status, events, release_at, created_at')
    .eq('seller_id', userId);
  if (body.status) q = q.eq('status', body.status);
  if (body.cursor) {
    const { created_at, id } = body.cursor;
    q = q.or(`created_at.lt.${created_at},and(created_at.eq.${created_at},id.lt.${id})`);
  }
  const { data, error } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[list-seller-orders] query error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  const rows = (data as OrderRow[] | null) ?? [];
  const next_cursor = rows.length === limit
    ? { created_at: rows[rows.length - 1].created_at, id: rows[rows.length - 1].id }
    : null;
  // Seller-only endpoint: scanToken is intentionally included on every row so
  // the seller UI can render the QR strip without a second round-trip per card.
  return { body: { orders: rows.map((r) => mapOrder(r)), next_cursor } };
}));
