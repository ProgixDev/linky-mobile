import type { Booking } from '../data/types';

/**
 * Jusqu'a quand un locataire peut-il annuler une reservation DEJA PAYEE ?
 *
 * Demande du client, 2026-09-23 : « Apres la reservation confirmee par les 2
 * parties, ajouter un bouton "Annuler la reservation" jusqu'a 48h avant la date
 * d'emmenagement. C'est une securite pour le client. »
 *
 * CE CALCUL NE FAIT QU'AFFICHER. La decision appartient a cancel_paid_booking
 * (migration 20260923_01), qui refait exactement la meme mesure cote serveur.
 * Un telephone a l'heure fausse peut donc voir le bouton apres la limite : il
 * recevra CANCEL_WINDOW_CLOSED, pas un remboursement. L'inverse — cacher le
 * bouton a quelqu'un qui y a encore droit — est le seul vrai risque, et c'est
 * pour cela qu'une date illisible fait tomber dans 'none' plutot que 'closed'.
 *
 * MINUIT HEURE DE CONAKRI = MINUIT UTC. Africa/Conakry est a UTC+0 toute
 * l'annee, sans heure d'ete : parser « YYYY-MM-DDT00:00:00Z » donne donc
 * exactement le debut du sejour tel que le serveur le calcule. Ecrire
 * `new Date(startDate)` sans le Z aurait donne minuit LOCAL au telephone — un
 * locataire a Paris aurait perdu une heure de fenetre, a Montreal en aurait
 * gagne cinq.
 */
export const CANCEL_WINDOW_HOURS = 48;

/** Instant limite (ms epoch), ou null si la date de debut est illisible. */
export function cancelDeadlineAt(startDate: string): number | null {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  return Number.isNaN(start) ? null : start - CANCEL_WINDOW_HOURS * 3_600_000;
}

/**
 * - 'open'   : le bouton s'affiche, l'annulation rembourse ;
 * - 'closed' : la fenetre est passee, on l'explique au lieu de laisser un
 *              bouton qui echouerait ;
 * - 'none'   : rien a proposer (vente, ou date illisible).
 */
export function paidCancelWindow(
  booking: Pick<Booking, 'period' | 'startDate'>,
  now: number,
): 'open' | 'closed' | 'none' {
  // Une VENTE n'a pas de date d'emmenagement : s'en retirer apres paiement
  // reste une decision de l'equipe, pas un bouton (meme regle cote SQL).
  if (booking.period === 'sale') return 'none';
  const deadline = cancelDeadlineAt(booking.startDate);
  if (deadline === null) return 'none';
  return now < deadline ? 'open' : 'closed';
}

/** « jeudi 25 septembre à 00:00 » — la limite, en clair. */
export function formatCancelDeadline(startDate: string): string | null {
  const at = cancelDeadlineAt(startDate);
  if (at === null) return null;
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }).format(new Date(at));
}
