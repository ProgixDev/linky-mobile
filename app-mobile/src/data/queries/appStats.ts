// Les chiffres de l'application pour l'accueil — /app-stats (public).
//
// L'accueil affiche les QUATRE chiffres demandés par le client (utilisateurs,
// annonces en ligne, ventes, réservations), et seulement ceux qui valent plus
// que zéro. Ce qui est compté se décide côté serveur (voir app-stats) : l'app
// ne fait qu'afficher ce qu'on lui donne. Un compteur peut encore valoir null —
// c'était le cas des anciennes versions de la fonction, qui le masquaient sous
// un seuil.
import { useQuery } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';

export interface AppStats {
  /** Null quand il vaut zéro, ou quand une ancienne version de la fonction le
   *  masquait sous un seuil. Optionnel : la réponse d'avant le 2026-10-27 ne
   *  le contenait pas, et une app plus récente que la fonction doit la lire
   *  sans planter. */
  listings?: number | null;
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
    // Le carrousel attend ces chiffres avant de s'afficher (ils passent en
    // tête) : une seule nouvelle tentative, pas les trois par défaut.
    retry: 1,
  });
}
