// Phase X.1 — buyer-side mirror of list-agent-visits. Returns the visit
// requests where the caller is the buyer, joined with a property snapshot
// (title, district, city, first photo) for the list card. Sorted by
// requested_at desc so the upcoming/most-recent slots surface first
// (opposite of list-agent-visits, which orders pending-first ascending).
// No cursor — a single buyer never accumulates more than ~50 visits in V1.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body { status?: string; limit?: number }

const STATUSES = new Set(['pending', 'accepted', 'rejected', 'cancelled', 'completed']);

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (x.status !== undefined && (typeof x.status !== 'string' || !STATUSES.has(x.status as string))) return false;
  if (x.limit !== undefined && (typeof x.limit !== 'number' || x.limit < 1 || x.limit > 200)) return false;
  return true;
}

interface PhotoRow { url: string; position: number }

interface Row {
  id: string;
  property_id: string;
  buyer_id: string;
  requested_at: string;
  note: string;
  status: string;
  decided_at: string | null;
  decided_by_id: string | null;
  created_at: string;
  property: {
    id: string;
    title: string;
    district: string | null;
    city: string;
    price_minor: number;
    per_month: boolean;
    type: string;
    photos: PhotoRow[] | null;
  } | null;
}

function mapVisit(r: Row) {
  const photoUrl = r.property?.photos && r.property.photos.length > 0
    ? r.property.photos.slice().sort((a, b) => a.position - b.position)[0].url
    : undefined;
  return {
    id: r.id,
    propertyId: r.property_id,
    buyerId: r.buyer_id,
    requestedAt: r.requested_at,
    note: r.note,
    status: r.status,
    decidedAt: r.decided_at ?? undefined,
    decidedById: r.decided_by_id ?? undefined,
    createdAt: r.created_at,
    property: r.property
      ? {
          id: r.property.id,
          title: r.property.title,
          district: r.property.district,
          city: r.property.city,
          // GNF is integer-only — minor units = major units. The client-wide
          // convention names the field priceGnf (matches Product.priceGnf) to
          // pre-empt a future /100 bug if a fractional currency ever lands.
          priceGnf: Number(r.property.price_minor),
          perMonth: r.property.per_month,
          // Lets the list card render « /jour » for daily rentals without
          // mislabelling vente/terrain prices.
          type: r.property.type,
          coverUrl: photoUrl,
        }
      : undefined,
  };
}

Deno.serve(makePost<Body>('/v1/visits/list-mine-buyer', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);
  const limit = body.limit ?? 100;

  let q = sb
    .from('visit_requests')
    .select(`
      id, property_id, buyer_id, requested_at, note, status,
      decided_at, decided_by_id, created_at,
      property:properties ( id, title, district, city, price_minor, per_month, type,
        photos:property_photos ( url, position ) )
    `)
    .eq('buyer_id', userId);

  if (body.status) q = q.eq('status', body.status);

  const { data, error } = await q
    .order('requested_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[list-my-visit-requests] query error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  const rows = (data as unknown as Row[] | null) ?? [];
  return { body: { visits: rows.map(mapVisit) } };
}));
