// Le solde que LengoPay detient pour Linky — reserve aux administrateurs.
//
// C'est l'argent depuis lequel les retraits des vendeurs sont reellement payes.
// La console des retraits montrait le solde du VENDEUR (ce qu'on lui doit) sans
// jamais dire s'il y avait de quoi l'honorer : un administrateur pouvait valider
// une file entiere que rien ne pourra financer, et ne le decouvrir qu'au
// virement.
//
// Lecture SEULE. Rien de ce qui est renvoye ne bouge d'argent.
//
// ⚠️ Admin uniquement, et ce n'est pas une precaution de principe : ce montant
// est la tresorerie de Linky. Un vendeur n'a aucune raison de la connaitre.
import { makePost } from '@shared/wrap.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';
import { getAccountBalance } from '@shared/lengopay.ts';

// Pas de corps : la question n'a pas de parametre. On accepte un objet vide
// comme le reste des endpoints admin.
type Body = Record<string, never>;

function valid(b: unknown): b is Body {
  return typeof b === 'object' && b !== null;
}

Deno.serve(makePost<Body>('/v1/admin/lengopay/balance', valid, async ({ sb, req }) => {
  const userId = await requireUser(req);
  await assertAdmin(sb, userId);

  // `getAccountBalance` ne LEVE jamais : elle rend `available: false` avec un
  // motif. C'est voulu — un appareil de suivi qui tombe en panne doit dire
  // « je ne sais pas », pas casser la page des retraits.
  const balance = await getAccountBalance();
  return { body: { balance } };
}));
