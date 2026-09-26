// Bloquer un utilisateur. Authentifié.
//
// Troisième exigence de la politique Google Play sur le contenu généré par les
// utilisateurs, après le signalement et la modération : pouvoir bloquer
// quelqu'un. L'effet du blocage est décrit dans _shared/blocks.ts — il masque
// le contenu DANS LES DEUX SENS, et il ne touche jamais une commande, une
// réservation ou un litige en cours.
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

Deno.serve(makePost<Body>('/v1/blocks/create', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);
  if (body.user_id === userId) throwApi('SELF_BLOCK', 400, 'On ne peut pas se bloquer soi-même.');

  const { data: target, error: tErr } = await sb
    .from('users').select('id').eq('id', body.user_id).maybeSingle();
  if (tErr) { console.error('[block-user] target:', tErr); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
  if (!target) throwApi('USER_NOT_FOUND', 404, 'Utilisateur introuvable.');

  // upsert plutôt qu'insert : bloquer deux fois est un no-op, pas une erreur.
  // La PK (blocker_id, blocked_id) porte l'idempotence.
  const { error } = await sb
    .from('blocked_users')
    .upsert({ blocker_id: userId, blocked_id: body.user_id }, { onConflict: 'blocker_id,blocked_id' });
  if (error) { console.error('[block-user] upsert:', error); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }

  return { body: { blocked: true } };
}));
