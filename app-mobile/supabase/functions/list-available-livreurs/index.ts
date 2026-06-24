// Seller-facing picker source : the list of approved livreurs a seller can
// assign to their own order. Authed (any signed-in user) — the actual assign
// is still seller-gated by assign_delivery, so this read is harmless on its
// own. Crucially it returns NO contact info (no phone, no email) : the seller
// picks by name/city/load and contact stays on-platform. The admin oversight
// list (admin-list-livreurs) is the one that carries phone for dispatch.
//
// Body : { city?: string, limit?: number } — pass the order's delivery city to
//   surface livreurs covering that zone first.
// Response : { livreurs: [{ id, name, city, vehicleType, activeDeliveries }] }
//   - city/vehicleType : from the courier's livreur_applications row (falls
//                        back to users.city when the role was granted outside
//                        an application).
//   - activeDeliveries : count of their deliveries in ('assigned','in_transit')
//                        — surfaced so the seller can pick the least-loaded.
//   Sort : same-city first, then activeDeliveries ascending (least loaded), then name.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body {
  city?: string;
  limit?: number;
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (x.city !== undefined && (typeof x.city !== 'string' || x.city.length > 120)) return false;
  if (x.limit !== undefined && (typeof x.limit !== 'number' || x.limit < 1 || x.limit > 100)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/livreurs/list-available', valid, async ({ sb, body, req }) => {
  // Authed gate only — no role/admin check. The list carries no PII and the
  // assign itself re-checks seller ownership server-side.
  await requireUser(req);

  const limit = body.limit ?? 50;
  const wantCity = (body.city ?? '').trim().toLowerCase();

  const { data: users, error } = await sb
    .from('users')
    .select('id, display_name, city')
    .contains('roles', ['livreur']);
  if (error) {
    console.error('[list-available-livreurs] users select error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  const rows = (users as { id: string; display_name: string | null; city: string | null }[] | null) ?? [];
  const ids = rows.map((u) => u.id);

  const appByUser = new Map<string, { city: string | null; vehicle_type: string | null }>();
  const activeByUser = new Map<string, number>();

  if (ids.length > 0) {
    const [{ data: apps }, { data: deliveries }] = await Promise.all([
      sb.from('livreur_applications').select('user_id, city, vehicle_type').in('user_id', ids),
      sb.from('deliveries').select('livreur_id, status').in('livreur_id', ids).in('status', ['assigned', 'in_transit']),
    ]);
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
      city: app?.city ?? u.city ?? null,
      vehicleType: app?.vehicle_type ?? null,
      activeDeliveries: activeByUser.get(u.id) ?? 0,
    };
  });

  // Sort : same-city first (when a city was passed), then least-loaded, then
  // name for a stable order. Case-insensitive city compare so "Conakry" and
  // "conakry" group together.
  livreurs.sort((a, b) => {
    if (wantCity) {
      const aSame = (a.city ?? '').trim().toLowerCase() === wantCity ? 0 : 1;
      const bSame = (b.city ?? '').trim().toLowerCase() === wantCity ? 0 : 1;
      if (aSame !== bSame) return aSame - bSame;
    }
    if (a.activeDeliveries !== b.activeDeliveries) return a.activeDeliveries - b.activeDeliveries;
    return (a.name ?? '').localeCompare(b.name ?? '');
  });

  return { body: { livreurs: livreurs.slice(0, limit) } };
}));
