// Les chiffres de l'application pour l'accueil — /app-stats (public).
//
// Chaque compteur vaut null tant qu'il n'a pas atteint son seuil, décidé côté
// serveur : c'est le serveur qui sait quand un chiffre cesse de desservir
// l'application, l'app ne fait qu'afficher ce qu'on lui donne.
import { useQuery } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';

export interface AppStats {
  /** Toujours renvoyés depuis le 2026-10-27 (vrais et présentables). Optionnels
   *  ici : une app mise à jour avant le redéploiement de la fonction doit
   *  encore lire l'ancienne réponse sans planter. */
  listings?: number | null;
  shops?: number;
  cities?: number;
  /** Null tant que leur seuil n'est pas atteint. */
  users: number | null;
  sales: number | null;
  bookings: number | null;
}

export function useAppStats() {
  return useQuery({
    queryKey: ['app-stats'],
    queryFn: () => apiPost<AppStats>({ path: '/app-stats', authed: false, body: {} }),
    // Des agrégats qui bougent à l'échelle de la journée : inutile de les
    // redemander à chaque retour sur l'accueil, sur un forfait 3G.
    staleTime: 10 * 60 * 1000,
  });
}
