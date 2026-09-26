// La numérotation des tunnels de création — UNE seule source.
//
// POURQUOI CE FICHIER EXISTE. Chaque écran codait son propre numéro en dur, et
// les six ne s'accordaient pas. Relevé le 2026-09-26, côté ARTICLE :
//   seller   « 1 / 6 »   pastille 0   ✓
//   category « 2 / 6 »   pastille 1   ✓
//   details  « 4 / 6 »   pastille 3   ✗ c'est le 3ᵉ écran
//   location « 4 / 6 »   pastille 4   ✗ même numéro que details
//   photos   « 5 / 6 »   pastille 4   ✗ même pastille que location
//   preview   aucun      pastille 5
// Côté BIEN c'était pire : details s'annonçait « 3 / 6 » alors qu'il ouvrait le
// tunnel, location « 5 / 6 », et amenities, photos et preview n'affichaient
// rien du tout. Le client a envoyé une capture de l'étape « 4 / 6 · Détails »
// qui est en réalité la troisième.
//
// Un tableau par tunnel, et l'écran demande sa place. On ne peut plus se
// tromper sans supprimer une entrée.
//
// LE TUNNEL IMMOBILIER EST CONDITIONNEL : un terrain n'a ni chambres ni
// équipements, location.tsx saute donc directement aux photos. Son tunnel fait
// cinq étapes, pas six — et afficher « 6 » à quelqu'un qui n'en verra que cinq
// est exactement le genre de petit mensonge qui fait douter du reste.

export type ProductStep = 'seller' | 'category' | 'details' | 'location' | 'photos' | 'preview';

export type PropertyStep = 'owner' | 'details' | 'location' | 'amenities' | 'photos' | 'preview';

export type PropertyType = 'location' | 'vente' | 'terrain';

const PRODUCT_ORDER: ProductStep[] = [
  'seller',
  'category',
  'details',
  'location',
  'photos',
  'preview',
];

const PROPERTY_ORDER: PropertyStep[] = [
  'owner',
  'details',
  'location',
  'amenities',
  'photos',
  'preview',
];

export interface StepPosition {
  /** Index à partir de 0 — ce qu'attend ProgressDots. */
  index: number;
  /** Numéro affiché, à partir de 1. */
  number: number;
  total: number;
}

function place<T extends string>(order: T[], step: T): StepPosition {
  const index = order.indexOf(step);
  // Un écran absent de l'ordre est un oubli de développement, pas un cas à
  // gérer à l'exécution : on le montre en première position plutôt que de
  // planter au milieu d'une publication.
  const safe = index < 0 ? 0 : index;
  return { index: safe, number: safe + 1, total: order.length };
}

export function productStep(step: ProductStep): StepPosition {
  return place(PRODUCT_ORDER, step);
}

export function propertyStep(step: PropertyStep, propertyType: PropertyType): StepPosition {
  const order =
    propertyType === 'terrain'
      ? PROPERTY_ORDER.filter((s) => s !== 'amenities')
      : PROPERTY_ORDER;
  return place(order, step);
}
