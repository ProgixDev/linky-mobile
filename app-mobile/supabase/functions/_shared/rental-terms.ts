// Les CONDITIONS d'une annonce de location : caution, séjour minimum, grille de
// prix par durée. Partagé par property-create et property-update — écrire ces
// règles deux fois, c'est les voir diverger au premier ajustement, et c'est le
// bailleur qui découvrirait l'écart en publiant.
//
// Ce module ne valide QUE la forme. Les invariants qui engagent de l'argent
// vivent en base (contraintes CHECK de la migration 20260927_01) : une règle
// qu'on peut contourner en appelant l'API autrement n'est pas une règle.
import { throwApi } from '@shared/errors.ts';

export type DepositBasis = 'amount' | 'months' | 'percent';
export type DepositKind = 'caution' | 'agency_fee';

export interface RateBody {
  kind: 'block' | 'tier';
  units: number;
  price_minor: number;
}

export interface RentalTermsBody {
  /** Les trois ensemble, ou aucun. `null` efface explicitement la condition. */
  deposit_basis?: DepositBasis | null;
  deposit_value?: number | null;
  deposit_kind?: DepositKind | null;
  min_nights?: number | null;
  min_months?: number | null;
  /** Grille complète : elle REMPLACE l'existante. Vide = tarif linéaire. */
  rates?: RateBody[];
}

const BASES = new Set(['amount', 'months', 'percent']);
const KINDS = new Set(['caution', 'agency_fee']);

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** Forme seulement — les bornes croisées sont re-tenues par la base. */
export function validRentalTerms(x: Record<string, unknown>): boolean {
  const { deposit_basis: b, deposit_value: v, deposit_kind: k } = x;

  if (b !== undefined && b !== null && (typeof b !== 'string' || !BASES.has(b))) return false;
  if (k !== undefined && k !== null && (typeof k !== 'string' || !KINDS.has(k))) return false;
  if (v !== undefined && v !== null && (!isInt(v) || v <= 0)) return false;

  // Un demi-réglage n'existe pas : le trio se pose ou s'efface ensemble. Le
  // refuser ICI plutôt que de laisser remonter la contrainte donne au bailleur
  // un message qu'il comprend au lieu d'un 500 opaque.
  const present = [b, v, k].filter((f) => f !== undefined && f !== null).length;
  const touched = [b, v, k].some((f) => f !== undefined);
  if (touched && present !== 0 && present !== 3) return false;

  for (const key of ['min_nights', 'min_months'] as const) {
    const m = x[key];
    if (m !== undefined && m !== null && (!isInt(m) || m < 1 || m > (key === 'min_nights' ? 90 : 36))) {
      return false;
    }
  }

  if (x.rates !== undefined) {
    if (!Array.isArray(x.rates) || x.rates.length > 4) return false;
    for (const r of x.rates) {
      if (typeof r !== 'object' || r === null) return false;
      const row = r as Record<string, unknown>;
      if (row.kind !== 'block' && row.kind !== 'tier') return false;
      if (!isInt(row.units)) return false;
      if (row.kind === 'block' && (row.units < 2 || row.units > 90)) return false;
      if (row.kind === 'tier' && (row.units < 2 || row.units > 36)) return false;
      if (!isInt(row.price_minor) || row.price_minor <= 0 || row.price_minor > 1_000_000_000_000) return false;
    }
    // Deux lignes de même durée se contrediraient ; la PK les refuserait avec
    // un message illisible.
    const seen = new Set<string>();
    for (const r of x.rates as RateBody[]) {
      const key = r.kind + ':' + r.units;
      if (seen.has(key)) return false;
      seen.add(key);
    }
  }
  return true;
}

/**
 * Les colonnes à écrire. `undefined` = le champ n'était pas dans la requête,
 * on n'y touche pas ; `null` = le bailleur efface.
 */
export function rentalTermsPatch(
  body: RentalTermsBody,
  type: 'location' | 'vente' | 'terrain',
  perMonth: boolean,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  // Une vente ou un terrain n'a ni caution ni séjour minimum. On EFFACE au lieu
  // d'ignorer : un bien passé de location à vente garderait sinon des
  // conditions invisibles et inapplicables, que la contrainte
  // properties_terms_rental_only_ck ferait ensuite échouer sur une
  // modification sans rapport.
  if (type !== 'location') {
    return {
      deposit_basis: null,
      deposit_value: null,
      deposit_kind: null,
      min_nights: null,
      min_months: null,
    };
  }

  if (body.deposit_basis !== undefined) {
    const clearing = body.deposit_basis === null;
    // « 2 mois de caution » n'a aucun sens sur une annonce à la journée ; la
    // base le refuse, autant ne pas l'écrire.
    if (!clearing && body.deposit_basis === 'months' && !perMonth) {
      throwApi('DEPOSIT_MONTHS_DAILY', 400,
        'Une caution en mois ne s\'applique qu\'à une location au mois.');
    }
    patch.deposit_basis = body.deposit_basis;
    patch.deposit_value = clearing ? null : body.deposit_value ?? null;
    patch.deposit_kind = clearing ? null : body.deposit_kind ?? 'caution';
  }

  // Les deux colonnes coexistent : celle qui ne correspond pas à la période est
  // MUETTE, jamais réinterprétée. Voir le commentaire de la migration.
  if (body.min_nights !== undefined) patch.min_nights = body.min_nights;
  if (body.min_months !== undefined) patch.min_months = body.min_months;

  return patch;
}

/** Les lignes de grille à insérer, filtrées par la période de l'annonce. */
export function rateRows(
  propertyId: string,
  rates: RateBody[] | undefined,
  type: 'location' | 'vente' | 'terrain',
  perMonth: boolean,
): { property_id: string; kind: string; units: number; price_minor: number }[] {
  if (!rates || rates.length === 0 || type !== 'location') return [];
  // Une grille de blocs sur une annonce au mois serait inerte (le moteur ne lit
  // que les paliers), et l'inverse aussi. On ne garde que ce qui sert : ainsi
  // le bailleur qui bascule sa période ne se retrouve pas avec des lignes
  // fantômes qu'aucun écran ne lui montre.
  const wanted = perMonth ? 'tier' : 'block';
  return rates
    .filter((r) => r.kind === wanted)
    .map((r) => ({
      property_id: propertyId,
      kind: r.kind,
      units: r.units,
      price_minor: r.price_minor,
    }));
}
