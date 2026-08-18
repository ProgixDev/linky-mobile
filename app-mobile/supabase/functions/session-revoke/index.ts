// Deconnexion cote SERVEUR (client 2026-08-18).
//
// Jusqu'ici, se deconnecter n'effacait que les jetons DU TELEPHONE : la session
// restait valide sur le serveur pendant 90 jours. Quiconque avait recupere le
// jeton de rafraichissement continuait d'entrer, meme apres que le proprietaire
// se soit deconnecte. Un telephone perdu, prete ou revendu restait donc une
// porte ouverte pendant trois mois.
//
// Deux portees, selon ce que l'appelant demande :
//   defaut    -> revoque la session courante seulement ;
//   all=true  -> revoque TOUTES les sessions du compte, pour « me deconnecter
//                partout » et le cas du telephone perdu.
//
// Idempotent : revoquer une session deja revoquee ne fait rien et ne renvoie
// pas d'erreur — la deconnexion ne doit jamais echouer cote app.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body { refresh_token?: string; all?: boolean }

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (x.refresh_token !== undefined && typeof x.refresh_token !== 'string') return false;
  if (x.all !== undefined && typeof x.all !== 'boolean') return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/session/revoke', valid, async ({ sb, body, req }) => {
  // L'appelant doit prouver son identite : sans cela, connaitre un identifiant
  // de session suffirait a deconnecter n'importe qui.
  const userId = await requireUser(req);
  const nowIso = new Date().toISOString();

  if (body.all) {
    const { error } = await sb
      .from('sessions')
      .update({ revoked_at: nowIso })
      .eq('user_id', userId)
      .is('revoked_at', null);
    if (error) {
      console.error('[session-revoke] revoke-all error:', error);
      throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
    }
    return { body: { revoked: 'all' } };
  }

  // Le jeton a la forme « <id de session>.<secret> » : seul l'identifiant nous
  // interesse ici, le secret n'a pas a circuler ni a etre compare — la
  // propriete est deja etablie par requireUser, et le filtre user_id empeche de
  // revoquer la session d'autrui meme avec un identifiant devine.
  const sessionId = (body.refresh_token ?? '').split('.')[0];
  if (!sessionId) {
    // Rien a revoquer de precis : on ne fait pas echouer la deconnexion.
    return { body: { revoked: 'none' } };
  }

  const { error } = await sb
    .from('sessions')
    .update({ revoked_at: nowIso })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .is('revoked_at', null);
  if (error) {
    console.error('[session-revoke] revoke-one error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  return { body: { revoked: 'current' } };
}));
