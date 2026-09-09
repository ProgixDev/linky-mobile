// Numeros mobiles guineens : 9 chiffres, commencent par 6. Un seul endroit
// pour cette regle — elle etait dupliquee dans app/wallet/retirer.tsx, et le
// 2026-08-25 un second appelant (le paiement mobile money pour les comptes
// sans numero) en avait besoin a l'identique. Deux copies auraient fini par
// diverger sur un point d'argent.

/** Retire un indicatif +224/224 colle, et tout ce qui n'est pas un chiffre. */
export function normalizeGnPhone(input: string): string {
  let d = input.replace(/\D/g, '');
  if (d.startsWith('224')) d = d.slice(3);
  return d.slice(0, 9);
}

/** « 622551288 » -> « 622 55 12 88 », pour l'affichage seulement. */
export function formatGnPhone(d: string): string {
  return [d.slice(0, 3), d.slice(3, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ');
}

export function isValidGnPhone(d: string): boolean {
  return d.length === 9 && d.startsWith('6');
}

/**
 * A quel operateur appartient ce numero ?
 *
 * POURQUOI CETTE FONCTION EXISTE. Le 2026-09-09 a 22:14, un paiement de
 * reservation a echoue ainsi :
 *   method='orange-money', payer_phone='+224660698848'
 *   RAIL_INIT_FAILED — Lengopay: {"message":"Incorrect phone number"}
 * 660698848 est un numero MTN, envoye sur le rail Orange Money. isValidGnPhone
 * l'avait accepte : elle ne verifie que « 9 chiffres commencant par 6 », ce qui
 * est vrai de TOUS les mobiles guineens, Orange comme MTN. L'utilisateur n'avait
 * aucun moyen de comprendre — le seul message qu'il voyait etait en anglais et
 * venait du prestataire.
 *
 * DEUX PREUVES DE PRODUCTION encadrent la regle : +224610574736 (61x) a paye
 * avec SUCCES sur orange-money le meme soir a 21:43 ; +224660698848 (66x) a ete
 * refuse par Orange a 22:14.
 *
 * ELLE REND 'unknown' DES QU'ELLE N'EST PAS SURE, ET C'EST DELIBERE. Le plan de
 * numerotation guineen evolue et je n'en ai pas la table officielle : ne sont
 * declares ici que les prefixes dont l'attribution est etablie. Tout le reste
 * passe sans entrave — mieux vaut laisser filer un numero douteux vers le rail,
 * qui tranchera, que bloquer un client dont le prefixe est simplement recent.
 * Un faux blocage sur un ecran de paiement coute une vente ; un faux passage ne
 * coute qu'un message d'erreur.
 */
export type GnOperator = 'orange' | 'mtn' | 'unknown';

export function gnOperator(d: string): GnOperator {
  if (!isValidGnPhone(d)) return 'unknown';
  const p = d.slice(0, 2);
  if (p === '61' || p === '62') return 'orange';
  if (p === '66' || p === '67') return 'mtn';
  return 'unknown';
}

/**
 * Le numero contredit-il le moyen de paiement choisi ? Rend le message a
 * afficher, ou null si rien ne s'oppose au paiement.
 */
export function gnOperatorMismatch(d: string, method: string): string | null {
  const op = gnOperator(d);
  if (op === 'unknown') return null;
  if (method === 'orange-money' && op === 'mtn') {
    return 'Ce numéro est un numéro MTN. Choisis « MTN Mobile Money » ou saisis un numéro Orange.';
  }
  if (method === 'mtn-money' && op === 'orange') {
    return 'Ce numéro est un numéro Orange. Choisis « Orange Money » ou saisis un numéro MTN.';
  }
  return null;
}
