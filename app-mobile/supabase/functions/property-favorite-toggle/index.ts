// Pre-prod: atomic property favorite toggle. Mirrors product-favorite-toggle :
// composite-key insert/delete + clamped fav_count update inside the RPC, all
// FOR UPDATE locked on the property row. Required by the Decouvrir reel so a
// like on a property persists + the count actually moves.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body { property_id: string }

function valid(b: unknown): b is Body {
  const x = b as Body;
  return !!x && typeof x.property_id === 'string' && /^[0-9a-f-]{36}$/i.test(x.property_id);
}

Deno.serve(makePost<Body>('/v1/properties/favorite-toggle', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);
  const { data, error } = await sb.rpc('toggle_property_favorite', {
    p_user_id: userId,
    p_property_id: body.property_id,
  });
  if (error) {
    console.error('[property-favorite-toggle] rpc error:', error);
    // 23503 = foreign_key_violation → property was deleted between request and RPC.
    if ((error as { code?: string }).code === '23503') {
      throwApi('PROPERTY_NOT_FOUND', 404, 'Bien introuvable');
    }
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
  if (!row) throwApi('INTERNAL_ERROR', 500, 'Réponse invalide');
  return {
    body: {
      favorited: !!(row as { favorited: boolean }).favorited,
      fav_count: Number((row as { fav_count: number }).fav_count),
    },
  };
}));
