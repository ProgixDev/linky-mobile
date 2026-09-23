/**
 * Arithmetique de mois cote application — JUMELLE de
 * `supabase/functions/_shared/dates.ts`.
 *
 * POURQUOI UNE COPIE PLUTOT QU'UN PARTAGE. Les fonctions edge tournent sous
 * Deno et resolvent `@shared/`, l'application sous Metro et resout `src/`. Rien
 * ne relie les deux arbres. La regle etant courte et figee, la dupliquer coute
 * moins cher qu'un paquet partage — a condition que les deux copies restent
 * d'accord, et que ce commentaire le rappelle.
 *
 * ICI, LE CALCUL NE SERT QU'A AFFICHER. Quand le locataire prolonge son bail,
 * l'ecran montre la date de reprise ; c'est `booking-request` qui la recalcule
 * et qui fait foi. Un ecart ne produirait donc pas une mauvaise reservation,
 * seulement un affichage trompeur — ce qui suffit a vouloir l'eviter.
 */

/**
 * Ajoute n mois a une date 'YYYY-MM-DD' en RABOTANT sur le dernier jour du mois
 * d'arrivee, exactement comme Postgres et comme le serveur.
 *
 * `new Date(2026, 0, 31)` plus un mois donne le 3 mars en JavaScript
 * (debordement) la ou Postgres rend le 28 fevrier (rabotage). Verifie contre
 * Postgres le 2026-09-23 :
 *   2026-01-31 + 1  -> 2026-02-28      2026-03-31 + 1  -> 2026-04-30
 *   2026-11-30 + 3  -> 2027-02-28      2026-08-31 + 6  -> 2027-02-28
 */
export function addMonthsClamped(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const total = m - 1 + n;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12; // 0-indexe
  // Jour 0 du mois suivant = dernier jour du mois vise.
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
