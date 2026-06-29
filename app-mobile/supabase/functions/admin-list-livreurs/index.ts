// Phase LIVREUR ASSIGNMENT — approved-livreur picker source. Admin-only
// (requireUser + assertAdmin).
//
// Body : {} (empty).
// Response : { livreurs: [{ id, name, phone, city, vehicleType,
//          activeDeliveries, isOnline }] } — every user carrying the 'livreur' role.
//   - isOnline : the courier's self-set availability (users.is_online).
//   - phone        : the user's primary phone (contact for dispatch).
//   - city/vehicle  : from the courier's livreur_applications row (falls back
//                     to users.city when granted outside an application).
//   - activeDeliveries : count of their deliveries in ('assigned','in_transit')
//                     — surfaced so the admin can balance the load.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';

// Empty-body endpoint — POST + idempotency-key to match the API surface.
type Body = Record<string, unknown>;
function valid(b: unknown): b is Body {
  return typeof b === 'object' && b !== null;
}

Deno.serve(makePost<Body>('/v1/admin/livreurs/list', valid, async ({ sb, req }) => {
  const adminId = await requireUser(req);
  await assertAdmin(sb, adminId);

  const { data: users, error } = await sb
    .from('users')
    .select('id, display_name, city, is_online')
    .contains('roles', ['livreur'])
    .order('display_name', { ascending: true });
  if (error) {
    console.error('[admin-list-livreurs] users select error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  const rows = (users as { id: string; display_name: string | null; city: string | null; is_online: boolean | null }[] | null) ?? [];
  const ids = rows.map((u) => u.id);

  const phoneByUser = new Map<string, string>();
  const appByUser = new Map<string, { city: string | null; vehicle_type: string | null }>();
  const activeByUser = new Map<string, number>();

  if (ids.length > 0) {
    const [{ data: phones }, { data: apps }, { data: deliveries }] = await Promise.all([
      sb.from('phones').select('user_id, e164, is_primary').in('user_id', ids),
      sb.from('livreur_applications').select('user_id, city, vehicle_type').in('user_id', ids),
      sb.from('deliveries').select('livreur_id, status').in('livreur_id', ids).in('status', ['assigned', 'in_transit']),
    ]);
    for (const p of (phones as { user_id: string; e164: string; is_primary: boolean }[] | null) ?? []) {
      if (p.is_primary || !phoneByUser.has(p.user_id)) phoneByUser.set(p.user_id, p.e164);
    }
    for (const a of (apps as { user_id: string; city: string | null; vehicle_type: string | null }[] | null) ?? []) {
      appByUser.set(a.user_id, { city: a.city, vehicle_type: a.vehicle_type });
    }
    for (const d of (deliveries as { livreur_id: string }[] | null) ?? []) {
      activeByUser.set(d.livreur_id, (activeByUser.get(d.livreur_id) ?? 0) + 1);
    }
  }

  const livreurs = rows.map((u) => {
    const app = appByUser.get(u.id);
    return {
      id: u.id,
      name: u.display_name,
      phone: phoneByUser.get(u.id) ?? null,
      city: app?.city ?? u.city ?? null,
      vehicleType: app?.vehicle_type ?? null,
      activeDeliveries: activeByUser.get(u.id) ?? 0,
      isOnline: u.is_online ?? false,
    };
  });

  return { body: { livreurs } };
}));
