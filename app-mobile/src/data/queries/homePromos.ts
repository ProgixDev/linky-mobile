// Les vidéos de pub du carrousel de l'accueil — /list-home-promos (public).
import { useQuery } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';

export interface HomePromo {
  id: string;
  title: string | null;
  subtitle: string | null;
  videoUrl: string | null;
  posterUrl: string | null;
  /** Un chemin de l'app (« /(tabs)/marche ») ou une URL. */
  linkUrl: string | null;
}

export function useHomePromos() {
  return useQuery({
    queryKey: ['home-promos'],
    queryFn: async () =>
      (await apiPost<{ promos: HomePromo[] }>({ path: '/list-home-promos', authed: false, body: {} })).promos,
    staleTime: 10 * 60 * 1000,
    // Une seule nouvelle tentative : sans pub, le carrousel se rabat sur les
    // annonces ; inutile de laisser l'accueil sur un squelette pendant les
    // trois essais par défaut.
    retry: 1,
  });
}
