// Pre-prod: list the authed user's phones (multi-phone-per-account model).
// Returns each row with the verified flag flattened from verified_at IS NOT NULL
// so the client doesn't have to interpret a nullable timestamp.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

// Empty-body endpoint — kept as POST + idempotency-key to match the rest of the
// Linky API surface. Any non-undefined object is a valid empty payload.
type Body = Record<string, unknown>;
function valid(b: unknown): b is Body {
  return typeof b === 'object' && b !== null;
}

interface PhoneRow {
  id: string;
  e164: string;
  carrier: string | null;
  is_primary: boolean;
  verified_at: string | null;
  created_at: string;
}

Deno.serve(makePost<Body>('/v1/phones/list', valid, async ({ sb, req }) => {
  const userId = await requireUser(req);
  const { data, error } = await sb
    .from('phones')
    .select('id, e164, carrier, is_primary, verified_at, created_at')
    .eq('user_id', userId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[list-my-phones] query error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  const phones = (data as PhoneRow[]).map((p) => ({
    id: p.id,
    e164: p.e164,
    carrier: p.carrier,
    is_primary: p.is_primary,
    verified: p.verified_at !== null,
    created_at: p.created_at,
  }));
  return { body: { phones } };
}));
