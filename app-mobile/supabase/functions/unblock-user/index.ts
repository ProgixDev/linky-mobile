// Débloquer un utilisateur. Authentifié. Symétrique de block-user.
//
// Le delete est idempotent : débloquer quelqu'un qu'on n'avait pas bloqué ne
// renvoie pas d'erreur. Rien à protéger ici — on ne peut supprimer qu'une ligne
// dont on est soi-même le blocker_id.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body { user_id: string }

const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  return typeof x.user_id === 'string' && UUID_RE.test(x.user_id);
}

Deno.serve(makePost<Body>('/v1/blocks/delete', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const { error } = await sb
    .from('blocked_users')
    .delete()
    .eq('blocker_id', userId)
    .eq('blocked_id', body.user_id);
  if (error) { console.error('[unblock-user] delete:', error); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }

  return { body: { blocked: false } };
}));
