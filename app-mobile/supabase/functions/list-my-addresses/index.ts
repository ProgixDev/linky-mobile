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
  return { body: { addresses: data as AddressRow[] } };
}));
