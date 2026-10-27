// Les chiffres de l'application pour l'accueil — /app-stats (public).
//
// Chaque compteur vaut null tant qu'il n'a pas atteint son seuil, décidé côté
// serveur : c'est le serveur qui sait quand un chiffre cesse de desservir
// l'application, l'app ne fait qu'afficher ce qu'on lui donne.
import { useQuery } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';

export interface AppStats {
  users: number | null;
  listings: number | null;
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
