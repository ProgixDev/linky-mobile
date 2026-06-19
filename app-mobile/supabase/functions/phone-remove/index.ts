// Pre-prod: delete a non-primary phone from the caller's account. The primary
// phone must be reassigned first — otherwise we'd let a user lock themselves
// out of their own login identity in one tap.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body { phone_id: string }
function valid(b: unknown): b is Body {
  const x = b as Body;
  return !!x && typeof x.phone_id === 'string' && /^[0-9a-f-]{36}$/i.test(x.phone_id);
}

Deno.serve(makePost<Body>('/v1/phones/remove', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const { data: row, error: eGet } = await sb
    .from('phones')
    .select('id, user_id, is_primary')
    .eq('id', body.phone_id)
    .maybeSingle();
  if (eGet) {
    console.error('[phone-remove] lookup error:', eGet);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  if (!row || row.user_id !== userId) {
    // Strict ownership check — surface as NOT_FOUND so the caller can't
    // probe which UUIDs exist on other accounts.
    throwApi('PHONE_NOT_FOUND', 404, 'Numéro introuvable');
  }
  if (row.is_primary) {
    throwApi('PHONE_IS_PRIMARY', 400, "Définis d'abord un autre numéro comme principal.");
  }

  const { error: eDel } = await sb.from('phones').delete().eq('id', body.phone_id).eq('user_id', userId);
  if (eDel) {
    console.error('[phone-remove] delete error:', eDel);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  return { body: { ok: true } };
}));
