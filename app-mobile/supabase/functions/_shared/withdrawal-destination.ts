// Traduire la DESTINATION d'une demande de retrait en cible de versement.
//
// ┌─ LE PROBLEME ───────────────────────────────────────────────────────────┐
// `withdrawal_requests.destination` est une CHAINE LIBRE, ecrite par l'app
// sous la forme `${operateur} — ${numero}` (app/wallet/retirer.tsx:192), par
// exemple « Orange Money — 622 12 45 78 ». Elle n'a jamais ete pensee pour
// une machine : elle existait pour qu'un administrateur la LISE avant de faire
// le virement depuis son propre telephone.
//
// Le versement Lengopay, lui, exige deux champs exacts :
//   account      le numero NU            « 622124578 »
//   type_account l'operateur             « lp-om-gn » ou « lp-momo-gn »
//
// Les deux sont enfouis dans ce texte. Les en extraire, c'est deviner — et on
// ne devine pas quand de l'argent part.
// └─────────────────────────────────────────────────────────────────────────┘
//
// ┌─ LA REGLE : DEUX SIGNAUX QUI DOIVENT CONCORDER ─────────────────────────┐
// L'operateur est determine DEUX FOIS, independamment :
//   1. par l'ETIQUETTE que l'app a ecrite  (« Orange Money », « MTN … »)
//   2. par le PREFIXE du numero            (61/62 = Orange, 66 = MTN)
//
// Si les deux ne disent pas la meme chose, ou si l'un des deux est inconnu,
// on REFUSE le versement automatique et la demande repart vers un humain.
//
// Un refus coute une minute a un administrateur. Un versement route vers le
// mauvais operateur coute l'argent, et il ne revient pas. L'asymetrie decide.
//
// ⚠ Le prefixe est une HEURISTIQUE GROSSIERE, heritee de
// `_shared/validate.ts:detectCarrier` qui le dit lui-meme. Un numero Orange
// legitime hors 61/62 sera refuse a tort. C'est volontaire : un refus se
// rattrape, un virement non.
// └─────────────────────────────────────────────────────────────────────────┘

export type PayoutTypeAccount = 'lp-om-gn' | 'lp-momo-gn';

export interface PayoutTarget {
  /** Le numero nu, 9 chiffres, sans indicatif ni espaces. */
  account: string;
  type_account: PayoutTypeAccount;
}

export type DestinationRefus =
  | 'NO_DIGITS'         // aucun numero exploitable
  | 'BAD_FORMAT'        // pas 9 chiffres commencant par 6
  | 'UNKNOWN_LABEL'     // l'etiquette ne nomme ni Orange ni MTN
  | 'CARRIER_MISMATCH'; // etiquette et prefixe se contredisent

export type DestinationParse =
  | { ok: true; target: PayoutTarget }
  | { ok: false; reason: DestinationRefus };

/** L'etiquette ecrite par l'app. Volontairement tolerante sur la casse et les
 *  variantes commerciales — mais pas au point d'accepter l'ambigu. */
function operateurDeLEtiquette(texte: string): PayoutTypeAccount | null {
  const t = texte.toLowerCase();
  const orange = /orange/.test(t);
  const mtn = /\bmtn\b|momo|areeba/.test(t);
  // Les deux mentionnes : on ne tranche pas a pile ou face.
  if (orange && mtn) return null;
  if (orange) return 'lp-om-gn';
  if (mtn) return 'lp-momo-gn';
  return null;
}

/** Le prefixe du numero. Meme table que `detectCarrier`, repetee ici pour que
 *  cette regle de versement soit lisible d'un seul tenant. */
function operateurDuPrefixe(numero9: string): PayoutTypeAccount | null {
  const p = numero9.slice(0, 2);
  if (p === '61' || p === '62') return 'lp-om-gn';
  if (p === '66') return 'lp-momo-gn';
  return null;
}

/** Extrait 9 chiffres commencant par 6, en tolerant l'indicatif +224 et
 *  n'importe quelle mise en forme (espaces, tirets, points). */
function numeroDeLaChaine(texte: string): string | null {
  let d = (texte.match(/\d/g) ?? []).join('');
  if (!d) return null;
  // « +224 622 12 45 78 » comme « 00224622124578 »
  if (d.length === 12 && d.startsWith('224')) d = d.slice(3);
  else if (d.length === 14 && d.startsWith('00224')) d = d.slice(5);
  if (d.length !== 9 || !d.startsWith('6')) return null;
  return d;
}

export function parseWithdrawalDestination(destination: string | null): DestinationParse {
  const texte = (destination ?? '').trim();
  if (!texte) return { ok: false, reason: 'NO_DIGITS' };

  const brut = (texte.match(/\d/g) ?? []).join('');
  if (!brut) return { ok: false, reason: 'NO_DIGITS' };

  const numero = numeroDeLaChaine(texte);
  if (!numero) return { ok: false, reason: 'BAD_FORMAT' };

  const parEtiquette = operateurDeLEtiquette(texte);
  if (!parEtiquette) return { ok: false, reason: 'UNKNOWN_LABEL' };

  const parPrefixe = operateurDuPrefixe(numero);
  if (parPrefixe !== parEtiquette) return { ok: false, reason: 'CARRIER_MISMATCH' };

  return { ok: true, target: { account: numero, type_account: parEtiquette } };
}

/** Pour les journaux et la console d'administration : dire POURQUOI on n'a pas
 *  verse, en francais, a quelqu'un qui devra le faire a la main. */
export function expliquerRefus(reason: DestinationRefus): string {
  switch (reason) {
    case 'NO_DIGITS':
      return 'Aucun numéro dans la destination.';
    case 'BAD_FORMAT':
      return 'Le numéro n’a pas la forme guinéenne attendue (9 chiffres commençant par 6).';
    case 'UNKNOWN_LABEL':
      return 'L’opérateur n’est pas nommé clairement (ni Orange Money, ni MTN).';
    case 'CARRIER_MISMATCH':
      return 'L’opérateur annoncé ne correspond pas au préfixe du numéro.';
  }
}
