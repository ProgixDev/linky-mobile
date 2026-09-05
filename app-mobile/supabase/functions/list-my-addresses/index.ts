// Pre-prod: list the authed user's saved addresses (address book).
// Default first, then most recently created. Empty-body endpoint kept as POST
// + idempotency-key to match the rest of the Linky API surface.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

type Body = Record<string, unknown>;
function valid(b: unknown): b is Body {
  return typeof b === 'object' && b !== null;
}

interface AddressRow {
  id: string;
  label: string;
  city: string;
  district: string | null;
  details: string | null;
  lat: number | null;
  lng: number | null;
  is_default: boolean;
  created_at: string;
}

Deno.serve(makePost<Body>('/v1/addresses/list', valid, async ({ sb, req }) => {
  const userId = await requireUser(req);
  const { data, error } = await sb
    .from('addresses')
    .select('id, label, city, district, details, lat, lng, is_default, created_at')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[list-my-addresses] query error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  const rows = data as AddressRow[] ?? [];
  // Tells the address book apart a real pin from the city/district centroid
  // fallback (addresses_set_geo trigger) — small address book (a handful of
  // rows per user), so a per-row RPC call is plenty fast.
  const withPinned = await Promise.all(rows.map(async (r) => {
    const { data: pinned } = await sb.rpc('geo_is_pinned', {
      p_lat: r.lat, p_lng: r.lng, p_city: r.city, p_district: r.district,
    });
    return { ...r, pinned: pinned ?? false };
  }));
  return { body: { addresses: withPinned } };
}));
