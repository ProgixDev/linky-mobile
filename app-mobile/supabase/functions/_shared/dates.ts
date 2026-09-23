// Arithmetique de dates de la machine de reservation.
//
// UNE SEULE REGLE COMPTE ICI : ce que calcule le serveur doit tomber sur la
// meme date que Postgres, parce que les deux decident du MEME sejour. Les crons
// (complete_ended_bookings, 20260916_02) et les fonctions de sequestre
// raisonnent en SQL avec `start_date + make_interval(months => n)` ; les
// fonctions edge raisonnent en TypeScript. Un ecart d'un jour entre les deux,
// et un bail se termine cote base alors qu'il est encore payable cote API.

/**
 * Ajoute n mois a une date 'YYYY-MM-DD', en RABOTANT sur le dernier jour du
 * mois d'arrivee — exactement comme Postgres.
 *
 * C'est le point qui se trompe facilement : `new Date(2026, 0, 31)` plus un
 * mois donne le 3 mars en JavaScript (debordement), la ou Postgres rend le
 * 28 fevrier (rabotage). Un bail signe un 31 se terminerait donc trois jours
 * trop tard cote API, et le locataire pourrait payer un sejour que la base
 * considere fini.
 *
 * Verifie contre Postgres le 2026-09-23 sur 7 cas, dont :
 *   2026-01-31 + 1  -> 2026-02-28      2026-03-31 + 1  -> 2026-04-30
 *   2026-11-30 + 3  -> 2027-02-28      2026-08-31 + 6  -> 2027-02-28
 *   2026-01-31 + 12 -> 2027-01-31      2026-05-15 + 24 -> 2028-05-15
 */
export function addMonthsClamped(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const total = (m - 1) + n;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;            // 0-indexe
  // Jour 0 du mois suivant = dernier jour du mois vise.
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Le jour courant a Conakry, en 'YYYY-MM-DD'.
 *
 * Africa/Conakry est a UTC+0 toute l'annee, sans heure d'ete : la date UTC EST
 * la date locale guineenne. Ce n'est donc pas un raccourci mais l'equivalent
 * exact de `(now() at time zone 'Africa/Conakry')::date` cote SQL. La fonction
 * existe pour que ce raisonnement soit ecrit une fois, ici, plutot que
 * redecouvert a chaque appel de `toISOString().slice(0, 10)`.
 */
export function todayConakry(): string {
  return new Date().toISOString().slice(0, 10);
}
