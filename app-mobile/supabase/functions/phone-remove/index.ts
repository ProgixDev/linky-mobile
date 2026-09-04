// Supprimer un numero du compte de l'appelant.
//
// Client 2026-09-03 : « les comptes qui ont rajoute un numero ne peuvent plus
// le supprimer. Il faut pouvoir modifier et/ou supprimer son numero comme
// l'adresse de livraison. »
//
// L'ancienne regle refusait TOUT numero principal (PHONE_IS_PRIMARY). Comme
// find_or_create_user_with_phone marque le premier numero is_primary=true, un
// compte cree par telephone n'avait qu'un numero, principal, donc indelebile :
// le bouton n'existait meme pas a l'ecran. La regle etait une approximation
// de la vraie contrainte, et elle bloquait le cas normal.
//
// LA VRAIE CONTRAINTE, verifiee ici parce que c'est la frontiere de confiance :
// il doit RESTER au moins un moyen de connexion apres la suppression — un
// autre numero, ou une adresse email verifiee. Ce n'est pas du confort :
// find_or_create_user_with_phone CREE UN NOUVEAU COMPTE VIDE a la prochaine
// connexion OTP si plus aucun numero ne correspond. L'utilisateur ne serait
// pas simplement bloque, il atterrirait dans un compte neuf — sans solde, sans
// commandes, sans boutique — et l'ancien deviendrait definitivement
// inaccessible. On ne compte que les emails VERIFIES : un email non verifie ne
// garantit pas de pouvoir se reconnecter.
//
// Si le numero supprime etait le principal, on en promeut un autre (comme
// address-remove le fait pour l'adresse par defaut). Sans ca le compte
// resterait a zero principal, ce qui casse en silence quatre chemins de
// paiement (place-order, place-orders-batch, create-boost, booking-sign-pay
// echouent avec PAYER_PHONE_REQUIRED) et bascule le profil de paiement.
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

  // Combien de moyens de connexion RESTERAIENT apres la suppression ?
  const { count: otherPhones, error: eCount } = await sb
    .from('phones')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .neq('id', body.phone_id);
  if (eCount) {
    console.error('[phone-remove] sibling count error:', eCount);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  const { count: verifiedEmails, error: eMail } = await sb
    .from('emails')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('verified_at', 'is', null);
  if (eMail) {
    console.error('[phone-remove] email count error:', eMail);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  if ((otherPhones ?? 0) === 0 && (verifiedEmails ?? 0) === 0) {
    throwApi('LAST_LOGIN_METHOD', 400,
      "C'est ta seule façon de te connecter. Ajoute un autre numéro avant de retirer celui-ci.");
  }

  const { error: eDel } = await sb.from('phones').delete().eq('id', body.phone_id).eq('user_id', userId);
  if (eDel) {
    console.error('[phone-remove] delete error:', eDel);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  // Le principal vient de partir : en promouvoir un autre. On prend le plus
  // recent VERIFIE — meme regle que phone-set-primary, qui refuse de rendre
  // principal un numero non verifie. La suppression a deja libere l'unicite
  // du principal, donc aucune collision possible ici.
  let promotedId: string | null = null;
  if (row.is_primary && (otherPhones ?? 0) > 0) {
    const { data: successor } = await sb
      .from('phones')
      .select('id')
      .eq('user_id', userId)
      .not('verified_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (successor) {
      const { error: ePromote } = await sb
        .from('phones')
        .update({ is_primary: true })
        .eq('id', successor.id)
        .eq('user_id', userId);
      if (ePromote) {
        // Non bloquant : le numero est supprime, c'est acquis. On journalise
        // pour pouvoir reparer, plutot que de rendre une erreur qui ferait
        // croire a l'utilisateur que rien ne s'est passe.
        console.error('[phone-remove] CRITICAL primary promotion failed', { userId, successor: successor.id, ePromote });
      } else {
        promotedId = successor.id;
      }
    }
  }

  return { body: { ok: true, promoted_phone_id: promotedId } };
}));
