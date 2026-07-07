// Admin — list rental bookings with the party names + property snapshot the
// console table needs. Bookings shipped 2026-07-06 with zero admin
// visibility; this is the read half of the admin module (the write half is
// admin-resolve-booking).
//
// Auth: requireUser → assertAdmin (same posture as every admin fn).
// Filters: status (optional), limit (default 100, max 200). Newest first.
// No cursor in V1 — booking volume is far below the admin lists that needed
// one, and the status filter narrows the working set.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';

interface Body { status?: string; limit?: number }

const STATUSES = new Set([
  'requested', 'accepted', 'rejected', 'cancelled',
  'paid', 'active', 'disputed', 'refunded', 'completed',
]);

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (x.status !== undefined && (typeof x.status !== 'string' || !STATUSES.has(x.status))) return false;
  if (x.limit !== undefined && (typeof x.limit !== 'number' || x.limit < 1 || x.limit > 200)) return false;
  return true;
}

interface Row {
  id: string;
  status: string;
  period: string;
  start_date: string;
  end_date: string | null;
  months: number | null;
  rent_minor: number;
  amount_minor: number;
  fees_minor: number;
  total_minor: number;
  created_at: string;
  updated_at: string;
  tenant_id: string;
  landlord_id: string;
  property_id: string;
  tenant: { display_name: string | null } | null;
  landlord: { display_name: string | null } | null;
  property: { title: string; city: string; district: string | null } | null;
}

Deno.serve(makePost<Body>('/v1/admin/bookings/list', valid, async ({ sb, body, req }) => {
  const adminId = await requireUser(req);
  await assertAdmin(sb, adminId);

  let q = sb
    .from('bookings')
    .select(`
      id, status, period, start_date, end_date, months,
      rent_minor, amount_minor, fees_minor, total_minor,
      created_at, updated_at, tenant_id, landlord_id, property_id,
      tenant:users!bookings_tenant_id_fkey ( display_name ),
      landlord:users!bookings_landlord_id_fkey ( display_name ),
      property:properties ( title, city, district )
    `);
  if (body.status) q = q.eq('status', body.status);

  const { data, error } = await q
    .order('created_at', { ascending: false })
    .limit(body.limit ?? 100);
  if (error) {
    console.error('[admin-list-bookings] query error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  const rows = (data as unknown as Row[] | null) ?? [];
  const bookings = rows.map((r) => ({
    id: r.id,
    status: r.status,
    period: r.period,
    start_date: r.start_date,
    end_date: r.end_date,
    months: r.months,
    rent_minor: Number(r.rent_minor),
    amount_minor: Number(r.amount_minor),
    fees_minor: Number(r.fees_minor),
    total_minor: Number(r.total_minor),
    created_at: r.created_at,
    updated_at: r.updated_at,
    tenant_id: r.tenant_id,
    landlord_id: r.landlord_id,
    property_id: r.property_id,
    tenant_name: r.tenant?.display_name ?? null,
    landlord_name: r.landlord?.display_name ?? null,
    property_title: r.property?.title ?? null,
    property_city: r.property?.city ?? null,
    property_district: r.property?.district ?? null,
  }));

  return { body: { bookings } };
}));
