// Les vidéos de pub du carrousel de l'accueil (client 2026-10-27 : « des
// vidéos de publicité » à la place des annonces). Public, sans authentification.
//
// Table home_promos (migration 20261027_01), gérée côté serveur : ajouter,
// retirer ou réordonner une pub ne demande AUCUNE mise à jour de l'app.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';

interface PromoRow {
  id: string;
  title: string | null;
  subtitle: string | null;
  video_url: string | null;
  poster_url: string | null;
  link_url: string | null;
}

function valid(b: unknown): b is Record<string, never> {
  return typeof b === 'object' && b !== null;
}

// Plus de dix pubs dans un carrousel d'accueil n'a pas de sens, et chacune
// pèse sur le forfait de quelqu'un.
const MAX_PROMOS = 10;

Deno.serve(makePost<Record<string, never>>('/v1/home/promos', valid, async ({ sb }) => {
  const { data, error } = await sb
    .from('home_promos')
    .select('id, title, subtitle, video_url, poster_url, link_url')
    .eq('active', true)
    .order('sort', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(MAX_PROMOS);
  if (error) {
    console.error('[list-home-promos] error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Publicités indisponibles');
  }
  const promos = ((data ?? []) as PromoRow[]).map((r) => ({
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    videoUrl: r.video_url,
    posterUrl: r.poster_url,
    linkUrl: r.link_url,
  }));
  return { body: { promos } };
}));
