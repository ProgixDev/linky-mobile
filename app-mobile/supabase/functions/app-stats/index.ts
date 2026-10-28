// Les chiffres de l'application, pour le carrousel de l'accueil. Le client
// (2026-10-25) : « Nombre d'utilisateurs, nombre d'annonces en ligne, nombre de
// ventes et de réservations réalisées ».
//
// ┌─ DÉCISION DU 2026-10-28 : LES COMPTES INTERNES SONT COMPTÉS ────────────┐
// Mesuré ce jour-là, six jours après la publication sur le Play Store :
//                     hors comptes internes    comptes internes compris
//   utilisateurs               2                        17
//   annonces en ligne         19                        19
//   ventes                     0                         9
//   réservations               0                         6
// Choix d'Achraf pour le client, en connaissant ces chiffres : les quatre,
// comptes internes compris, sans seuil. Les seuils (100 / 20 / 10) qui les
// masquaient jusque-là sont levés.
// Pour revenir aux chiffres hors comptes internes : COUNT_INTERNAL_ACCOUNTS =
// false, puis redéployer. Aucune mise à jour de l'application n'est nécessaire.
// └─────────────────────────────────────────────────────────────────────────┘
//
// ┌─ CE QUI EST COMPTÉ ─────────────────────────────────────────────────────┐
// utilisateurs  comptes non supprimés, HORS admins et comptes système (le
//               porte-monnaie de la plateforme n'est l'utilisateur de personne).
// annonces      articles + biens au statut 'active' : ce qui est réellement en
//               ligne, quel que soit l'auteur.
// ventes        commandes 'released' (l'argent est parti au vendeur : la vente
//               est conclue). 'delivered' est un statut mort, jamais écrit.
// réservations  'active' ou 'completed' (le locataire est entré). 'paid' n'est
//               encore que du séquestre.
// Toute la requête vit dans app_public_counts (migration 20261027_01).
// └─────────────────────────────────────────────────────────────────────────┘
//
// ┌─ LES VERSIONS DE L'APP DÉJÀ INSTALLÉES ──────────────────────────────────┐
// Seuls les quatre chiffres du client sont renvoyés, et un chiffre NUL vaut
// null. Ce n'est pas qu'une question de goût, ce sont les versions en service :
//   - celle de production (ce972d4) affiche une tuile pour toute valeur non
//     nulle, ZÉRO COMPRIS : « 0 Ventes réalisées » en première page si un
//     compteur retombait à 0 (comptes internes retirés, données de test
//     effacées). Null la fait disparaître ;
//   - celle du canal preview (85ed3e9) affichait aussi boutiques et villes : ne
//     plus les renvoyer lui fait montrer exactement les quatre du client.
// app_public_counts calcule encore shops et cities ; ils ne sortent plus d'ici.
// └─────────────────────────────────────────────────────────────────────────┘
//
// Public, sans authentification : ce sont des agrégats, rien d'individuel.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';

// Voir l'encadré ci-dessus.
const COUNT_INTERNAL_ACCOUNTS = true;

// Comptes internes, identifiés le 2026-10-26 avec reference_prod_test_identities.
// Liste FERMÉE et datée. Lue seulement si COUNT_INTERNAL_ACCOUNTS vaut false.
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

// Toujours exclus : ce ne sont pas des personnes.
const SYSTEM_USER_IDS = [
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
];

const EXCLUDED = COUNT_INTERNAL_ACCOUNTS ? SYSTEM_USER_IDS : [...INTERNAL_USER_IDS, ...SYSTEM_USER_IDS];

/** Zéro ne se montre pas : null le cache dans toutes les versions de l'app. */
function shown(n: number | undefined): number | null {
  return typeof n === 'number' && n > 0 ? n : null;
}

function valid(b: unknown): b is Record<string, never> {
  return typeof b === 'object' && b !== null;
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
      users: shown(c.users),
      listings: shown(c.listings),
      sales: shown(c.sales),
      bookings: shown(c.bookings),
    },
  };
}));
