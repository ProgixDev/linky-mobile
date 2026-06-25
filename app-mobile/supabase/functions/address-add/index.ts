// Pre-prod: add an address to the caller's address book. Validates string
// caps + the curated Guinea city allowlist (a tampered client can't insert
// a junk city). If is_default is requested — or this is the user's first
// saved address — the new row is promoted via set_default_address inside
// the same RPC's transaction so the partial-unique index never trips.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { isKnownGuineaCity } from '@shared/cities.ts';

interface Body {
  label: string;
  city: string;
  district?: string | null;
  details?: string | null;
  is_default?: boolean;
  // Exact delivery point picked on the map; overrides the city centroid default
  // (the addresses geo trigger only fills lat/lng when they're null).
  lat?: number | null;
  lng?: number | null;
}
// A finite coordinate within bounds, OR null/undefined (clear / not set).
function isCoord(v: unknown, max: number): boolean {
  return v === undefined || v === null || (typeof v === 'number' && Number.isFinite(v) && v >= -max && v <= max);
}
function valid(b: unknown): b is Body {
  const x = b as Body;
  if (!x || typeof x !== 'object') return false;
  if (typeof x.label !== 'string' || x.label.trim().length === 0 || x.label.length > 60) return false;
  if (typeof x.city !== 'string' || x.city.length === 0 || x.city.length > 60) return false;
  if (x.district != null && (typeof x.district !== 'string' || x.district.length > 80)) return false;
  if (x.details != null && (typeof x.details !== 'string' || x.details.length > 200)) return false;
  if (x.is_default != null && typeof x.is_default !== 'boolean') return false;
  if (!isCoord(x.lat, 90)) return false;
  if (!isCoord(x.lng, 180)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/addresses/add', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const label = body.label.trim();
  const city = body.city.trim();
  const district = body.district?.trim() || null;
  const details = body.details?.trim() || null;

  if (!isKnownGuineaCity(city)) {
    throwApi('INVALID_CITY', 400, 'Cette ville n\'est pas reconnue.');
  }

  // Detect first-ever address — promote it to default even if the caller
  // didn't ask, so the user always has a default after their first add.
  const { count, error: eCount } = await sb
    .from('addresses')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (eCount) {
    console.error('[address-add] count error:', eCount);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  const shouldDefault = body.is_default === true || (count ?? 0) === 0;

  const { data: row, error: eIns } = await sb
    .from('addresses')
    .insert({
      user_id: userId,
      label,
      city,
      district,
      details,
      lat: body.lat ?? null,
      lng: body.lng ?? null,
      is_default: false, // promoted in the RPC below if needed ; insert always false to avoid race
    })
    .select('id, label, city, district, details, lat, lng, is_default, created_at')
    .single();
  if (eIns || !row) {
    console.error('[address-add] insert error:', eIns);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  if (shouldDefault) {
    const { error: eRpc } = await sb.rpc('set_default_address', {
      p_user_id: userId,
      p_address_id: row.id,
    });
    if (eRpc) {
      console.error('[address-add] set_default rpc error:', eRpc);
      throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
    }
    row.is_default = true;
  }

  return { body: { address: row } };
}));
