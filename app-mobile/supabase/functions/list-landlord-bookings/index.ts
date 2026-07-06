// Landlord's incoming bookings, newest first, with the tenant's display name
// joined. Powers the "Suivi des baux" screens (/agent/leases).
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body { limit?: number }

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (x.limit !== undefined && (typeof x.limit !== 'number' || x.limit < 1 || x.limit > 100)) return false;
  return true;
}

interface Row {
  id: string; property_id: string; tenant_id: string; period: string;
  start_date: string; end_date: string | null; months: number | null;
  rent_minor: number | string; amount_minor: number | string; fees_minor: number | string;
  total_minor: number | string; status: string; note: string;
  property_snapshot: Record<string, unknown>; contract: Record<string, unknown> | null;
  landlord_signed_at: string | null; tenant_signed_at: string | null;
  events: unknown[]; created_at: string;
}

Deno.serve(makePost<Body>('/v1/bookings/list-landlord', valid, async ({ sb, body, req }) => {
  const landlordId = await requireUser(req);
  const limit = body.limit ?? 50;

  const { data, error } = await sb
    .from('bookings')
    .select('id, property_id, tenant_id, period, start_date, end_date, months, rent_minor, amount_minor, fees_minor, total_minor, status, note, property_snapshot, contract, landlord_signed_at, tenant_signed_at, events, created_at')
    .eq('landlord_id', landlordId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { console.error('[list-landlord-bookings] query:', error); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
  const rows = (data as Row[] | null) ?? [];

  const nameById = new Map<string, string | null>();
  if (rows.length > 0) {
    const ids = [...new Set(rows.map((r) => r.tenant_id))];
    const { data: users } = await sb.from('users').select('id, display_name').in('id', ids);
    for (const u of (users as { id: string; display_name: string | null }[] | null) ?? []) {
      nameById.set(u.id, u.display_name);
    }
  }

  const bookings = rows.map((r) => ({
    id: r.id,
    propertyId: r.property_id,
    period: r.period,
    startDate: r.start_date,
    endDate: r.end_date,
    months: r.months,
    rentGnf: Number(r.rent_minor),
    amountGnf: Number(r.amount_minor),
    feesGnf: Number(r.fees_minor),
    totalGnf: Number(r.total_minor),
    status: r.status,
    note: r.note,
    property: r.property_snapshot,
    contract: r.contract,
    landlordSignedAt: r.landlord_signed_at,
    tenantSignedAt: r.tenant_signed_at,
    events: r.events,
    createdAt: r.created_at,
    counterpartyName: nameById.get(r.tenant_id) ?? null,
  }));

  return { body: { bookings } };
}));
