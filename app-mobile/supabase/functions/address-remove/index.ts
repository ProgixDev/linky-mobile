// Pre-prod: delete an owned address. If the removed row was the default and
// another address remains, the most recent surviving row is promoted to
// default — so the user always has a default to fall back on at checkout
// time once they have at least one address saved.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body { address_id: string }
function valid(b: unknown): b is Body {
  const x = b as Body;
  return !!x && typeof x.address_id === 'string' && /^[0-9a-f-]{36}$/i.test(x.address_id);
}

Deno.serve(makePost<Body>('/v1/addresses/remove', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const { data: row, error: eGet } = await sb
    .from('addresses')
    .select('id, user_id, is_default')
    .eq('id', body.address_id)
    .maybeSingle();
  if (eGet) {
    console.error('[address-remove] lookup error:', eGet);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  if (!row || row.user_id !== userId) {
    throwApi('ADDRESS_NOT_FOUND', 404, 'Adresse introuvable');
  }

  const { error: eDel } = await sb
    .from('addresses')
    .delete()
    .eq('id', body.address_id)
    .eq('user_id', userId);
  if (eDel) {
    console.error('[address-remove] delete error:', eDel);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  // If we just removed the default, promote the most recent surviving row.
  if (row.is_default) {
    const { data: next, error: eNext } = await sb
      .from('addresses')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (eNext) {
      console.error('[address-remove] next-default lookup error:', eNext);
      throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
    }
    if (next) {
      const { error: eRpc } = await sb.rpc('set_default_address', {
        p_user_id: userId,
        p_address_id: next.id,
      });
      if (eRpc) {
        console.error('[address-remove] promote rpc error:', eRpc);
        throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
      }
    }
  }

  return { body: { ok: true } };
}));
