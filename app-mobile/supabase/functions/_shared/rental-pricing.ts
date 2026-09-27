// ============================================================================
// MOTEUR DE PRIX D'UNE LOCATION — grille par duree + caution.
//
// ⚠ CE FICHIER EXISTE EN DEUX EXEMPLAIRES, OCTET POUR OCTET :
//      src/lib/rentalPricing.ts                      (application)
//      supabase/functions/_shared/rental-pricing.ts  (serveur)
//   Deno ne peut pas importer hors de supabase/functions, et Metro ne peut pas
//   importer depuis @shared. Le depot porte deja deux jumeaux de cette famille
//   (fees.ts, dates.ts) et aucun n'a de garde-fou : la discipline y tient a un
//   commentaire d'en-tete. Celui-ci decide du prix d'un CONTRAT SIGNE, donc il
//   a le sien : `node scripts/check-twins.mjs` refuse si les deux divergent.
//   Toute modification se fait dans les DEUX, puis on relance ce script.
//
// LA FORME, EN UNE PHRASE POUR LE BAILLEUR : « Tu ne saisis aucune remise. Tu
// donnes tes prix — la nuit, la semaine, le mois — et l'application cherche pour
// ton locataire la combinaison la moins chere. »
//
// C'est ainsi que le client raisonne lui-meme. Son exemple : « le prix de base
// etait a 450 000 / jour [...] mais ils ont baisse a 8 000 000 / mois. Si c'est
// pour 2 semaines ils te laissent a 400 000 / jour. » Jamais un pourcentage —
// toujours un prix rond pour une duree.
//
// LA PROPRIETE QUI JUSTIFIE TOUT LE RESTE : le moteur ne DIVISE jamais. Tous
// les totaux sont des sommes des entiers que le bailleur a tapes. Dans un
// projet ou un franc d'ecart fait un contrat faux, c'est la seule maniere de se
// passer d'une regle d'arrondi. La seule division du fichier est celle du
// pourcentage de caution, et elle est isolee dans resolveDeposit.
// ============================================================================

export type RentalPeriod = 'day' | 'month';

export type DepositBasis = 'amount' | 'months' | 'percent';

export type DepositKind = 'caution' | 'agency_fee';

/** Une ligne de la grille du bailleur. */
export interface RateRow {
  /** 'block' = annonce au jour (prix d'un bloc de N nuits). 'tier' = annonce au mois. */
  kind: 'block' | 'tier';
  units: number;
  priceMinor: number;
}

/** Un morceau du decoupage retenu, tel qu'il s'affiche au locataire. */
export interface RatePart {
  units: number;
  priceMinor: number;
  count: number;
}

export interface RateQuote {
  /** Ce que coute le sejour (journalier) ou le premier mois (mensuel), hors caution. */
  rentMinor: number;
  /** Le meme sejour au tarif lineaire, pour la comparaison barree. */
  fullMinor: number;
  /** fullMinor - rentMinor. Jamais negatif : le moteur retient un minimum. */
  discountMinor: number;
  /** Le decoupage. Vide en mensuel : il n'y a qu'un loyer, pas un empilement. */
  parts: RatePart[];
}

/** Bornes alignees sur booking-request (MAX_NIGHTS) et bookings.months. */
export const MAX_NIGHTS = 90;
export const MAX_MONTHS = 36;

/**
 * Le prix d'un sejour a la JOURNEE.
 *
 * Programmation dynamique sur les nuits. Le `Math.max(0, ...)` porte toute
 * l'intelligence : il autorise un bloc PLUS GRAND que le besoin, ce qui garantit
 * qu'on ne paie jamais plus cher qu'un forfait superieur. C'est lui qui rend la
 * courbe monotone — 20 nuits coutent le prix du mois parce que deux semaines
 * plus six nuits couteraient davantage.
 *
 * Cout : nuits x (1 + nombre de blocs) operations entieres, soit ~360 au pire.
 * Tourne a chaque tape du calendrier, sans une seule requete reseau.
 */
function quoteNights(baseNightMinor: number, blocks: RateRow[], nights: number): RateQuote {
  const full = baseNightMinor * nights;
  if (nights <= 0) {
    return { rentMinor: 0, fullMinor: 0, discountMinor: 0, parts: [] };
  }

  // Les blocs utilisables, tries pour un decoupage stable d'une execution a
  // l'autre : a prix egal, le plus GRAND bloc d'abord (moins de lignes a lire).
  const usable = blocks
    .filter((b) => b.kind === 'block' && b.units >= 2 && b.priceMinor > 0)
    .slice()
    .sort((a, b) => b.units - a.units);

  // dp[i] = cout minimal pour couvrir i nuits. choice[i] = le bloc retenu.
  const dp: number[] = new Array(nights + 1).fill(0);
  const choice: number[] = new Array(nights + 1).fill(1);
  for (let i = 1; i <= nights; i += 1) {
    let best = baseNightMinor + dp[i - 1];
    let bestUnits = 1;
    for (const b of usable) {
      const rest = dp[Math.max(0, i - b.units)];
      const candidate = b.priceMinor + rest;
      if (candidate < best) {
        best = candidate;
        bestUnits = b.units;
      }
    }
    dp[i] = best;
    choice[i] = bestUnits;
  }

  // Remontee du decoupage, puis repli des repetitions (« 2 semaines » et non
  // « 1 semaine + 1 semaine »).
  const picked: number[] = [];
  let i = nights;
  while (i > 0) {
    const u = choice[i];
    picked.push(u);
    i = Math.max(0, i - u);
  }
  picked.reverse();

  const priceOf = (units: number): number =>
    units === 1 ? baseNightMinor : (usable.find((b) => b.units === units)?.priceMinor ?? baseNightMinor * units);

  const parts: RatePart[] = [];
  for (const u of picked) {
    const last = parts[parts.length - 1];
    if (last && last.units === u) last.count += 1;
    else parts.push({ units: u, priceMinor: priceOf(u), count: 1 });
  }

  const rent = dp[nights];
  return {
    rentMinor: rent,
    fullMinor: full,
    // Un sur-couvrement peut rendre le total inferieur au lineaire mais jamais
    // superieur : dp[i] part toujours de « base + dp[i-1] ».
    discountMinor: Math.max(0, full - rent),
    parts,
  };
}

/**
 * Le loyer MENSUEL applicable a un bail de N mois.
 *
 * Pas d'empilement ici, et ce n'est pas un oubli : seul le PREMIER mois transite
 * par Linky, les suivants se reglent entre les parties. Empiler des blocs n'y
 * voudrait rien dire. Le bailleur declare des paliers d'engagement — « a partir
 * de 6 mois, 8 000 000 » — et on retient le meilleur palier atteint.
 */
function quoteMonths(baseMonthMinor: number, tiers: RateRow[], months: number): RateQuote {
  let rent = baseMonthMinor;
  for (const t of tiers) {
    if (t.kind !== 'tier' || t.priceMinor <= 0) continue;
    if (months >= t.units && t.priceMinor < rent) rent = t.priceMinor;
  }
  return {
    rentMinor: rent,
    fullMinor: baseMonthMinor,
    discountMinor: Math.max(0, baseMonthMinor - rent),
    parts: [],
  };
}

/**
 * Le point d'entree unique. `units` = nuits en journalier, mois en mensuel.
 * Une grille vide rend exactement le tarif lineaire d'avant ce lot, au franc.
 */
export function quoteRental(
  period: RentalPeriod,
  basePriceMinor: number,
  rates: RateRow[],
  units: number,
): RateQuote {
  return period === 'day'
    ? quoteNights(basePriceMinor, rates, units)
    : quoteMonths(basePriceMinor, rates, units);
}

/**
 * La caution, ou les frais d'agence, en francs.
 *
 * @param monthlyRentMinor  le loyer mensuel APRES remise — une caution de deux
 *                          mois sur un bail obtenu a 8 000 000 vaut 16 000 000,
 *                          pas 27 000 000. Le locataire depose une garantie
 *                          proportionnelle au loyer qu'il paie reellement.
 * @param stayRentMinor     le loyer de la duree reservee, apres remise. C'est la
 *                          base du pourcentage : le seul montant que le locataire
 *                          a deja sous les yeux, donc le seul qu'il puisse
 *                          verifier.
 */
export function resolveDeposit(
  basis: DepositBasis | null | undefined,
  value: number | null | undefined,
  monthlyRentMinor: number,
  stayRentMinor: number,
): number {
  if (!basis || value == null || value <= 0) return 0;
  if (basis === 'amount') return Math.trunc(value);
  if (basis === 'months') return Math.trunc(value) * monthlyRentMinor;
  // LA SEULE DIVISION DU FICHIER. `value` est en points de base : 1000 = 10 %.
  // Les deux jumeaux doivent arrondir pareil, d'ou Math.round explicite et non
  // une troncature implicite.
  return Math.round((stayRentMinor * Math.trunc(value)) / 10000);
}

/**
 * Le sejour demande respecte-t-il le minimum de l'annonce ?
 * Rend null si tout va bien, sinon le minimum exige — le message se compose
 * cote appelant, qui seul connait la langue.
 */
export function minStayShortfall(
  period: RentalPeriod,
  minNights: number | null | undefined,
  minMonths: number | null | undefined,
  units: number,
): number | null {
  const min = period === 'day' ? minNights : minMonths;
  if (!min || min <= 1) return null;
  return units < min ? min : null;
}
