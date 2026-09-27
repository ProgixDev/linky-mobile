import type { Property } from '../data/types';

// Le BROUILLON des conditions de location, tel qu'il vit dans un formulaire —
// et sa traduction vers le corps d'API.
//
// POURQUOI UN BROUILLON DISTINCT DU MODÈLE. À l'écran, « pas de caution » et
// « caution de 0 » sont deux choses différentes : la première est une case
// décochée, la seconde une saisie incomplète. Côté API en revanche, les deux
// s'écrivent `null`. Garder un booléen `depositEnabled` à côté de la valeur
// évite de perdre ce que le bailleur avait tapé quand il décoche puis recoche —
// et évite surtout d'envoyer un demi-réglage, que la base refuserait.

export type DepositBasis = 'amount' | 'months' | 'percent';
export type DepositKind = 'caution' | 'agency_fee';

export interface RentalTermsDraft {
  depositEnabled: boolean;
  depositBasis: DepositBasis;
  depositValue: number;
  depositKind: DepositKind;
  minStayEnabled: boolean;
  /** Nuits ou mois selon la période de l'annonce — jamais les deux à la fois. */
  minStay: number;
  /**
   * La grille, indexée par `${kind}:${units}`. Zéro = le bailleur n'a pas
   * rempli cette ligne, elle ne part pas.
   */
  rates: Record<string, number>;
}

/** Les durées proposées. Le bailleur n'invente aucun seuil. */
export const DAY_BLOCKS = [7, 30] as const;
export const MONTH_TIERS = [3, 6, 12] as const;

export const EMPTY_TERMS: RentalTermsDraft = {
  depositEnabled: false,
  depositBasis: 'months',
  depositValue: 1,
  depositKind: 'caution',
  minStayEnabled: false,
  minStay: 2,
  rates: {},
};

/** Ce qu'une annonce existante donne comme brouillon, pour l'écran de modification. */
export function termsFromProperty(p: Property): RentalTermsDraft {
  const rates: Record<string, number> = {};
  for (const r of p.rates ?? []) rates[r.kind + ':' + r.units] = r.priceMinor;
  const minStay = p.perMonth ? p.minMonths : p.minNights;
  return {
    depositEnabled: !!p.depositBasis,
    depositBasis: p.depositBasis ?? 'months',
    depositValue: p.depositValue ?? 1,
    depositKind: p.depositKind ?? 'caution',
    minStayEnabled: !!minStay && minStay > 1,
    minStay: minStay && minStay > 1 ? minStay : 2,
    rates,
  };
}

/**
 * Le corps d'API. `null` efface explicitement côté serveur — c'est ce qui
 * permet à un bailleur de RETIRER une caution, là où `undefined` aurait
 * simplement laissé l'ancienne en place.
 */
export function termsToBody(d: RentalTermsDraft, period: 'day' | 'month') {
  const enabled = d.depositEnabled && d.depositValue > 0;
  const units = period === 'day' ? DAY_BLOCKS : MONTH_TIERS;
  const kind = period === 'day' ? 'block' : 'tier';
  return {
    deposit_basis: enabled ? d.depositBasis : null,
    deposit_value: enabled ? d.depositValue : null,
    deposit_kind: enabled ? d.depositKind : null,
    // Les deux colonnes coexistent : celle qui ne correspond pas à la période
    // reste MUETTE plutôt que d'être réinterprétée. On efface donc l'autre.
    min_nights: period === 'day' && d.minStayEnabled && d.minStay > 1 ? d.minStay : null,
    min_months: period === 'month' && d.minStayEnabled && d.minStay > 1 ? d.minStay : null,
    rates: units
      .map((u) => ({ kind: kind as 'block' | 'tier', units: u, price_minor: d.rates[kind + ':' + u] ?? 0 }))
      .filter((r) => r.price_minor > 0),
  };
}

/**
 * Le prix à la nuit qu'implique un bloc — la ligne grise sous le champ.
 * C'est elle qui rend la saisie utilisable sans mode d'emploi : le bailleur
 * tape le nombre rond qu'il a en tête, et lit aussitôt ce que ça veut dire.
 * Rend null tant qu'il n'a rien tapé.
 */
export function perNightHint(blockPrice: number, units: number): number | null {
  if (!blockPrice || blockPrice <= 0 || units <= 0) return null;
  return Math.round(blockPrice / units);
}

/**
 * Une ligne de grille plus chère que le tarif plein ne sera JAMAIS retenue par
 * le moteur — il prend un minimum. Ce n'est donc pas une faute, mais le
 * bailleur croit avoir fait une remise : on le lui dit.
 */
export function isPointless(blockPrice: number, units: number, basePrice: number): boolean {
  return blockPrice > 0 && basePrice > 0 && blockPrice >= basePrice * units;
}
