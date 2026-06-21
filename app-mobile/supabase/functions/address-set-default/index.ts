// Pre-prod: mark an owned address as the caller's default. Calls the
// set_default_address RPC which atomically clears any other default for
// this user then sets this one ; the partial unique index
// addresses_one_default_per_user enforces the invariant at the DB level.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body { address_id: string }
function valid(b: unknown): b is Body {
  const x = b as Body;
  return !!x && typeof x.address_id === 'string' && /^[0-9a-f-]{36}$/i.test(x.address_id);
}

Deno.serve(makePost<Body>('/v1/addresses/set-default', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  // Ownership check done inside the RPC too (defense in depth) ; we mirror
  // the phone-set-primary lookup so the error path stays consistent and the
  // caller can't probe which UUIDs exist on other accounts.
  const { data: row, error: eGet } = await sb
    .from('addresses')
    .select('id, user_id, is_default')
    .eq('id', body.address_id)
    .maybeSingle();
  if (eGet) {
    console.error('[address-set-default] lookup error:', eGet);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  if (!row || row.user_id !== userId) {
    throwApi('ADDRESS_NOT_FOUND', 404, 'Adresse introuvable');
  }
  if (row.is_default) {
    return { body: { ok: true } };
  }

  const { error: eRpc } = await sb.rpc('set_default_address', {
    p_user_id: userId,
    p_address_id: body.address_id,
  });
  if (eRpc) {
    console.error('[address-set-default] rpc error:', eRpc);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  return { body: { ok: true } };
}));
