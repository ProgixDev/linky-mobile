// Les chiffres de l'application, pour l'accueil (client 2026-10-25) :
// « Nombre d'utilisateurs, nombre d'annonces en ligne, nombre de ventes et de
// réservations réalisées ».
//
// Depuis le 2026-10-27 (le client veut ces chiffres DANS le carrousel) :
// annonces, boutiques/agences et villes sont toujours renvoyés — vrais et
// présentables dès maintenant. Les seuils ne gardent que utilisateurs, ventes
// et réservations.
//
// ┌─ POURQUOI DES SEUILS ───────────────────────────────────────────────────┐
// Mesuré le 2026-10-26, lendemain de la publication sur le Play Store : 20
// comptes, dont 18 internes (le client sous trois comptes, sa sœur, le
// développeur sous six, les comptes de revue Google, l'admin, les comptes
// système). Afficher « 20 utilisateurs · 9 ventes » en grand sur la première
// page desservirait la confiance — et ces chiffres ne seraient même pas vrais.
//
// Un compteur n'est donc renvoyé QUE s'il a atteint son seuil ; sinon il vaut
// null et l'app ne l'affiche pas. Le bloc entier disparaît tant qu'aucun n'est
// prêt, et apparaît de lui-même quand les chiffres deviennent parlants. Les
// seuils vivent ICI, pas dans l'app : les baisser est un redéploiement de
// cette fonction, pas une mise à jour de l'application.
// └─────────────────────────────────────────────────────────────────────────┘
//
// ┌─ CE QUI EST COMPTÉ, ET CE QUI NE L'EST PAS ─────────────────────────────┐
// utilisateurs  comptes non supprimés, HORS admins, comptes système et
//               comptes internes (liste ci-dessous).
// annonces      articles + biens au statut 'active' : ce qui est réellement en
//               ligne, quel que soit l'auteur — une annonce d'essai visible du
//               public EST en ligne.
// ventes        commandes 'released' (l'argent est parti au vendeur : la vente
//               est conclue), hors acheteurs internes. 'delivered' est un
//               statut mort, jamais écrit.
// réservations  'active' ou 'completed' (le locataire est entré), hors
//               locataires internes. 'paid' n'est encore que du séquestre.
// └─────────────────────────────────────────────────────────────────────────┘
//
// Public, sans authentification : ce sont des agrégats, rien d'individuel.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';

// Comptes internes, identifiés le 2026-10-26 avec reference_prod_test_identities.
// Liste FERMÉE et datée : un nouveau compte de test créé plus tard sera compté
// comme réel — les seuils absorbent ce bruit tant que les volumes sont faibles.
const INTERNAL_USER_IDS = [
  '019fc6b6-9369-7ce5-b3f0-1c16db4c4a62', // Madiou Barry — abdoulayebah193@ : le client
  '019fc6b7-1dc9-7724-b488-6502c75070a8', // Abdoul — le client
  '019fc92a-fb45-746e-9150-932d43f0471b', // Bouba — hello@linkygroup.com
  '019fc9da-3bce-741f-8abd-f9be73a4bb33', // Djenabou Bah — sa sœur, opéré par le client
  '019fcb9a-4047-78d6-8c5a-fb3426014c77', // Achraf — le développeur
  '019fd988-3de4-73db-b0b5-6afac7b43e5e', // Ichou — le développeur
  '019feda1-37dc-786e-ad9a-a497cfda49c0', // Abdoul — support@linkygroup.com
  '01a00eb1-1ef7-76af-bcd0-e53b50aab026', // Borz — le développeur (EAS)
  '01a0233a-2e2d-7cd2-98f9-1bc70a458ab6', // Achraf — achrafprojix@
  '01a02344-811c-7783-a731-4e26a462ecf6', // Achraf — achrafbenamrane40@
  '01a0290f-9b89-7201-b972-fec71edf4014', // Achraf Progix
  '01a07dee-ed73-7774-b638-be2cd53e7aa1', // review@linkygroup.com — revue Google
  '01a08905-498a-7f5d-ab20-3c60d5082705', // support.linky@gmail.com — revue Google
  '01a0ed81-188a-75c3-80bc-382af65d7670', // ichouqlf@ — le développeur (EAS)
  '01a15ef3-468d-73d2-ac5b-44219057f7e0', // Livreur Démo — revue Google de Dépose
];

const SYSTEM_USER_IDS = [
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
];

// À partir de combien un chiffre cesse de desservir l'application.
const THRESHOLDS = {
  users: 100,
  sales: 20,
  bookings: 10,
} as const;

const EXCLUDED = [...INTERNAL_USER_IDS, ...SYSTEM_USER_IDS];

function valid(b: unknown): b is Record<string, never> {
  return typeof b === 'object' && b !== null;
}

function gate(n: number, seuil: number): number | null {
  return n >= seuil ? n : null;
}

Deno.serve(makePost<Record<string, never>>('/v1/app/stats', valid, async ({ sb }) => {
  // Une seule requête (app_public_counts, migration 20261027_01) : six comptes
  // séparés coûtaient six allers-retours, et le nombre de VILLES distinctes ne
  // se calcule pas avec un simple count.
  const { data, error } = await sb.rpc('app_public_counts', { p_excluded: EXCLUDED });
  if (error || !data) {
    console.error('[app-stats] app_public_counts error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Statistiques indisponibles');
  }
  const c = data as Record<string, number>;

  return {
    body: {
      // Vrais et présentables dès aujourd'hui (19 annonces, 9 boutiques et
      // agences, 5 villes au 2026-10-27) : toujours renvoyés.
      listings: c.listings ?? 0,
      shops: c.shops ?? 0,
      cities: c.cities ?? 0,
      // Ceux-là desservent l'application tant qu'ils sont bas : seuils.
      users: gate(c.users ?? 0, THRESHOLDS.users),
      sales: gate(c.sales ?? 0, THRESHOLDS.sales),
      bookings: gate(c.bookings ?? 0, THRESHOLDS.bookings),
    },
  };
}));
