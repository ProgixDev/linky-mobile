// Pre-prod: edit label / city / district / details of an owned address.
// is_default is NOT mutable here — promotion goes through address-set-default
// so the RPC's atomic clear-then-set is always the only path that can flip
// the flag (the partial-unique index would otherwise be racy under
// concurrent update + set-default).
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { isKnownGuineaCity } from '@shared/cities.ts';

interface Body {
  address_id: string;
  label: string;
  city: string;
  district?: string | null;
  details?: string | null;
}
function valid(b: unknown): b is Body {
  const x = b as Body;
  if (!x || typeof x !== 'object') return false;
  if (typeof x.address_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(x.address_id)) return false;
  if (typeof x.label !== 'string' || x.label.trim().length === 0 || x.label.length > 60) return false;
  if (typeof x.city !== 'string' || x.city.length === 0 || x.city.length > 60) return false;
  if (x.district != null && (typeof x.district !== 'string' || x.district.length > 80)) return false;
  if (x.details != null && (typeof x.details !== 'string' || x.details.length > 200)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/addresses/update', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const city = body.city.trim();
  if (!isKnownGuineaCity(city)) {
    throwApi('INVALID_CITY', 400, 'Cette ville n\'est pas reconnue.');
  }

  const { data: existing, error: eGet } = await sb
    .from('addresses')
    .select('id, user_id')
    .eq('id', body.address_id)
    .maybeSingle();
  if (eGet) {
    console.error('[address-update] lookup error:', eGet);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  if (!existing || existing.user_id !== userId) {
    // Strict ownership ; surface as NOT_FOUND so a caller can't probe
    // which UUIDs exist on other accounts.
    throwApi('ADDRESS_NOT_FOUND', 404, 'Adresse introuvable');
  }

  const { data: row, error: eUpd } = await sb
    .from('addresses')
    .update({
      label: body.label.trim(),
      city,
      district: body.district?.trim() || null,
      details: body.details?.trim() || null,
    })
    .eq('id', body.address_id)
    .eq('user_id', userId)
    .select('id, label, city, district, details, is_default, created_at')
    .single();
  if (eUpd || !row) {
    console.error('[address-update] update error:', eUpd);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  return { body: { address: row } };
}));
