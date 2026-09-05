// Phase LIVREUR ASSIGNMENT — admin delivery board. Admin-only
// (requireUser + assertAdmin).
//
// Body : { status?: 'unassigned'|'assigned'|'in_transit'|'delivered'|'failed'|
//          'cancelled', limit?, cursor? }  (default 'unassigned').
// Response : { deliveries: [{ id, orderId, status, deliveryAddress,
//          assignedLivreur?: { id, name }, order: { reference, productSnapshot,
//          amountGnf, buyerCity, batchId }, groupRoute: { orderedRefs, totalKm }
//          | null, createdAt }], next_cursor }
//
// The order is inner-joined (every delivery has one). The buyer's city and the
// assigned livreur's name come from a batch users lookup (avoids fragile
// nested embeds), same approach as admin-list-livreur-applications.
//
// groupRoute (added 2026-09-05): for a multi-shop cart batch (batchId shared
// across ≥2 deliveries in this view), the suggested pickup order + total
// distance for one livreur to do the whole batch in one trip — but ONLY when
// every shop and the drop-off have a real map pin (geo_is_pinned), never a
// city-centroid guess. null otherwise, including for non-batch deliveries.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';

const STATUSES = new Set(['unassigned', 'assigned', 'in_transit', 'delivered', 'failed', 'cancelled']);
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

interface Cursor { created_at: string; id: string }
interface Body {
  status?: 'unassigned' | 'assigned' | 'in_transit' | 'delivered' | 'failed' | 'cancelled';
  limit?: number;
  cursor?: Cursor;
}

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

// Haversine, mirrors the SQL public.haversine_km() used for pricing — kept as
// plain JS here since this only ever runs over the handful of shops in one
// batch group (≤ 3 in practice), so a round-trip per pair isn't worth it.
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371.0;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) out.push([items[i], ...p]);
  }
  return out;
}

/** Best pickup order (shop1 → shop2 → ... → dropoff) by total distance.
 *  Brute-force — fine for the tiny N a single cart batch ever produces. */
function bestPickupOrder(
  stops: { id: string; lat: number; lng: number }[],
  dropoff: { lat: number; lng: number },
): { orderedIds: string[]; totalKm: number } {
  let best: { orderedIds: string[]; totalKm: number } | null = null;
  for (const perm of permutations(stops)) {
    let total = 0;
    for (let i = 0; i < perm.length - 1; i++) {
      total += haversineKm(perm[i].lat, perm[i].lng, perm[i + 1].lat, perm[i + 1].lng);
    }
    total += haversineKm(perm[perm.length - 1].lat, perm[perm.length - 1].lng, dropoff.lat, dropoff.lng);
    if (!best || total < best.totalKm) best = { orderedIds: perm.map((p) => p.id), totalKm: total };
  }
  return best!;
}

interface DeliveryRow {
  id: string;
  order_id: string;
  livreur_id: string | null;
  status: string;
  delivery_address: Record<string, unknown> | null;
  gps_lat: number | null;
  gps_lng: number | null;
  created_at: string;
  order: {
    reference: string;
    product_snapshot: { title: string; photo: string; priceGnf: number } | null;
    amount_minor: number | string;
    buyer_id: string;
    status: string;
    batch_id: string | null;
    shop_id: string;
  } | null;
}

Deno.serve(makePost<Body>('/v1/admin/deliveries/list', valid, async ({ sb, body, req }) => {
  const adminId = await requireUser(req);
  await assertAdmin(sb, adminId);

  const status = body.status ?? 'unassigned';
  const limit = body.limit ?? 50;

  let q = sb
    .from('deliveries')
    .select('id, order_id, livreur_id, status, delivery_address, gps_lat, gps_lng, created_at, order:orders!inner(reference, product_snapshot, amount_minor, buyer_id, status, batch_id, shop_id)')
    .eq('status', status);

  // The "À assigner" queue must only surface deliveries the admin can ACTUALLY
  // assign: assign_delivery gates on the order being paid/preparing (the escrow
  // invariant), so cancelled / released / disputed / refunded orders would reject
  // with "état ne permettant pas l'assignation". Filter them out of the unassigned
  // view so the admin never picks a non-assignable order. (assigned/in_transit/…
  // views are already-dispatched deliveries, shown for tracking as-is.)
  if (status === 'unassigned') {
    q = q.in('order.status', ['paid', 'preparing']);
  }

  if (body.cursor) {
    const { created_at, id } = body.cursor;
    q = q.or(`created_at.lt.${created_at},and(created_at.eq.${created_at},id.lt.${id})`);
  }

  const { data, error } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[admin-list-deliveries] select error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  const rows = (data as DeliveryRow[] | null) ?? [];

  // Batch-load buyer cities + assigned-livreur names in one users query.
  const buyerIds = rows.map((r) => r.order?.buyer_id).filter((v): v is string => !!v);
  const livreurIds = rows.map((r) => r.livreur_id).filter((v): v is string => !!v);
  const ids = [...new Set([...buyerIds, ...livreurIds])];
  const cityByUser = new Map<string, string | null>();
  const nameByUser = new Map<string, string | null>();
  if (ids.length > 0) {
    const { data: users } = await sb.from('users').select('id, display_name, city').in('id', ids);
    for (const u of (users as { id: string; display_name: string | null; city: string | null }[] | null) ?? []) {
      cityByUser.set(u.id, u.city);
      nameByUser.set(u.id, u.display_name);
    }
  }

  // Multi-shop cart batches (place_orders_batch) share one batch_id across
  // their per-shop orders. For a group of ≥2 deliveries in THIS view, suggest
  // a pickup order + total distance — but only when every shop AND the drop-off
  // are real pins (geo_is_pinned), never the city-centroid fallback: an
  // "optimized route" computed from centroids would just be wrong, not
  // approximate. Below that bar, the admin still sees the group (badge +
  // one-click assign, from the batchId field) — just no distance claim.
  const batchGroups = new Map<string, DeliveryRow[]>();
  for (const r of rows) {
    const batchId = r.order?.batch_id;
    if (!batchId) continue;
    const list = batchGroups.get(batchId) ?? [];
    list.push(r);
    batchGroups.set(batchId, list);
  }
  const routeByDeliveryId = new Map<string, { orderedRefs: string[]; totalKm: number }>();
  const eligibleGroups = [...batchGroups.values()].filter((g) => g.length >= 2);
  if (eligibleGroups.length > 0) {
    const shopIds = [...new Set(eligibleGroups.flatMap((g) => g.map((r) => r.order!.shop_id)))];
    const { data: shopRows } = await sb.from('shops').select('id, lat, lng, city').in('id', shopIds);
    const shopById = new Map(
      ((shopRows as { id: string; lat: number | null; lng: number | null; city: string }[] | null) ?? [])
        .map((s) => [s.id, s]),
    );
    for (const group of eligibleGroups) {
      const first = group[0];
      const addr = (first.delivery_address ?? {}) as { city?: string; district?: string };
      const shops = group.map((r) => ({ id: r.id, shop: shopById.get(r.order!.shop_id) }));
      if (shops.some((s) => s.shop?.lat == null || s.shop?.lng == null)) continue;
      const pinChecks = await Promise.all([
        ...shops.map((s) =>
          sb.rpc('geo_is_pinned', { p_lat: s.shop!.lat, p_lng: s.shop!.lng, p_city: s.shop!.city, p_district: null }),
        ),
        sb.rpc('geo_is_pinned', {
          p_lat: first.gps_lat, p_lng: first.gps_lng, p_city: addr.city ?? null, p_district: addr.district ?? null,
        }),
      ]);
      const allPinned = pinChecks.every((p) => p.data === true);
      if (!allPinned || first.gps_lat == null || first.gps_lng == null) continue;
      const { orderedIds, totalKm } = bestPickupOrder(
        shops.map((s) => ({ id: s.id, lat: s.shop!.lat!, lng: s.shop!.lng! })),
        { lat: first.gps_lat, lng: first.gps_lng },
      );
      const refById = new Map(group.map((r) => [r.id, r.order?.reference ?? '—']));
      const route = { orderedRefs: orderedIds.map((id) => refById.get(id) ?? '—'), totalKm };
      for (const r of group) routeByDeliveryId.set(r.id, route);
    }
  }

  const deliveries = rows.map((r) => ({
    id: r.id,
    orderId: r.order_id,
    status: r.status,
    deliveryAddress: r.delivery_address,
    assignedLivreur: r.livreur_id
      ? { id: r.livreur_id, name: nameByUser.get(r.livreur_id) ?? null }
      : null,
    order: r.order
      ? {
          reference: r.order.reference,
          productSnapshot: r.order.product_snapshot,
          amountGnf: Number(r.order.amount_minor),
          buyerCity: cityByUser.get(r.order.buyer_id) ?? null,
          // Shared across the N per-shop orders a multi-shop cart batch creates
          // (place_orders_batch) — null for a single-shop order. Lets the admin
          // console group same-batch deliveries so they don't get split across
          // two different livreurs without anyone noticing.
          batchId: r.order.batch_id ?? null,
        }
      : null,
    // Present only when every shop + the drop-off in this delivery's batch
    // group have a real pin — see the computation above for why a shakier
    // guess isn't offered instead of nothing.
    groupRoute: routeByDeliveryId.get(r.id) ?? null,
    createdAt: r.created_at,
  }));

  const next_cursor = rows.length === limit
    ? { created_at: rows[rows.length - 1].created_at, id: rows[rows.length - 1].id }
    : null;

  return { body: { deliveries, next_cursor } };
}));
