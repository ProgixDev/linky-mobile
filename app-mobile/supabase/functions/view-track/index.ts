// Fire-and-forget view counter. Public, no JWT — view counts are de-anonymized later
// via session correlation if needed. The client calls this on detail-screen mount;
// missed increments (network blips, app suspended) are acceptable. Returns { ok: true }.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';

interface Body { kind: 'product' | 'property'; id: string }

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (x.kind !== 'product' && x.kind !== 'property') return false;
  if (typeof x.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(x.id)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/views/track', valid, async ({ sb, body }) => {
  const { error } = await sb.rpc('increment_view_count', {
    p_kind: body.kind,
    p_id: body.id,
  });
  if (error) {
    console.error('[view-track] rpc error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  return { body: { ok: true } };
}));
