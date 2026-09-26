import {
  Wifi,
  Car,
  Snowflake,
  ChefHat,
  Shield,
  Trees,
  Waves,
  ArrowUpDown,
  Sun,
  Zap,
  Droplet,
  Box,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

// Le catalogue des équipements d'un bien — UNE seule source.
//
// POURQUOI IL SORT DE L'ÉCRAN DE SAISIE. Jusqu'au 2026-09-26 cette liste ne
// vivait que dans app/create/property/amenities.tsx, parce qu'elle n'était
// utilisée qu'à la saisie : les équipements cochés par le bailleur
// n'atteignaient JAMAIS un locataire. Ils étaient bien écrits en base et bien
// relus par les requêtes — `PropertyRow.amenities` existe — mais `mapProperty`
// ne les recopiait pas dans l'objet rendu à l'application, `Property` n'avait
// pas le champ, et la fiche du bien ne les affichait nulle part. Un bailleur
// cochait « Climatisation, Groupe électrogène, Eau courante » pour personne.
//
// Maintenant que la fiche les montre, deux écrans lisent le catalogue. Une
// seconde copie aurait divergé au premier ajout d'équipement — et un
// identifiant présent d'un côté seulement s'affiche comme une ligne vide.
//
// LES IDENTIFIANTS SONT DES CLÉS DE BASE, STABLES. Ce sont eux qui sont
// stockés dans properties.amenities ; les libellés se résolvent à l'affichage
// par i18n. Renommer un id casserait les annonces déjà publiées.
export const AMENITY_DEFS: { id: string; labelKey: string; Icon: LucideIcon }[] = [
  { id: 'electricity', labelKey: 'create.amenityElectricity', Icon: Zap },
  { id: 'water',       labelKey: 'create.amenityWater',       Icon: Droplet },
  { id: 'ac',          labelKey: 'create.amenityClim',        Icon: Snowflake },
  { id: 'park',        labelKey: 'create.amenityParking',     Icon: Car },
  { id: 'sec',         labelKey: 'create.amenitySec',         Icon: Shield },
  { id: 'pool',        labelKey: 'create.amenityPool',        Icon: Waves },
  { id: 'garden',      labelKey: 'create.amenityGardenAlt',   Icon: Trees },
  { id: 'kitchen',     labelKey: 'create.amenityKitchen',     Icon: ChefHat },
  { id: 'wifi',        labelKey: 'create.amenityWifi',        Icon: Wifi },
  { id: 'lift',        labelKey: 'create.amenityLift',        Icon: ArrowUpDown },
  { id: 'terrace',     labelKey: 'create.amenityTerrace',     Icon: Sun },
  { id: 'cellar',      labelKey: 'create.amenityCellar',      Icon: Box },
];

/** Retrouve un équipement par son identifiant stocké. */
export function amenityDef(id: string) {
  return AMENITY_DEFS.find((a) => a.id === id);
}
