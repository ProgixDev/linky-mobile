// List visit requests across all properties owned by the caller (the agent).
// JWT-authed; PostgREST inner-join on properties.owner_id enforces scoping at
// the query layer. Sorted by requested_at asc so upcoming/pending slots surface
// first. Optional status filter. No cursor — typical agents will have far fewer
// than 200 requests; revisit if the list grows.
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
  property: { id: string; owner_id: string; title: string; district: string | null; city: string } | null;
  buyer: { id: string; display_name: string | null; avatar_url: string | null } | null;
}

function mapVisit(r: Row) {
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
        }
      : undefined,
    buyer: r.buyer
      ? {
          id: r.buyer.id,
          displayName: r.buyer.display_name ?? undefined,
          avatarUrl: r.buyer.avatar_url ?? undefined,
        }
      : undefined,
  };
}

Deno.serve(makePost<Body>('/v1/visits/list-mine-agent', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);
  const limit = body.limit ?? 100;

  let q = sb
    .from('visit_requests')
    .select(`
      id, property_id, buyer_id, requested_at, note, status,
      decided_at, decided_by_id, created_at,
      property:properties!inner ( id, owner_id, title, district, city ),
      buyer:users!buyer_id ( id, display_name, avatar_url )
    `)
    .eq('property.owner_id', userId);

  if (body.status) q = q.eq('status', body.status);

  const { data, error } = await q
    .order('requested_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[list-agent-visits] query error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  const rows = (data as unknown as Row[] | null) ?? [];
  return { body: { visits: rows.map(mapVisit) } };
}));
