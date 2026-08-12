// Créneaux déjà réservés d'un bien, pour griser le calendrier (client
// 2026-08-11 : « le calendrier doit verrouiller les dates déjà réservées »).
//
// booking-request refusait DEJA un chevauchement — mais seulement au moment de
// valider. Le locataire choisissait donc ses dates a l'aveugle et n'apprenait
// qu'a l'envoi que le logement etait pris. Cette fonction expose la meme verite
// AVANT le choix.
//
// Ne bloquent que les statuts 'paid' et 'active' — exactement le filtre de
// booking-request, et exactement la regle voulue par le client : une demande en
// attente ne verrouille rien, le proprietaire arbitre entre plusieurs
// candidats. Toute divergence entre les deux listes ferait mentir le
// calendrier, donc ce filtre doit rester identique la-bas et ici.
//
// Lecture PUBLIQUE et volontairement pauvre : uniquement des dates, jamais
// l'identite du locataire ni le montant. Savoir qu'un logement est pris du 12
// au 27 est justement l'information qu'on veut afficher a tout le monde.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';

interface Body { property_id: string }

function valid(b: unknown): b is Body {
  const x = b as Body;
  return !!x && typeof x.property_id === 'string' && /^[0-9a-f-]{36}$/i.test(x.property_id);
}

interface Row {
  period: 'day' | 'month';
  start_date: string;
  end_date: string | null;
}

Deno.serve(makePost<Body>('/v1/properties/availability', valid, async ({ sb, body }) => {
  const { data, error } = await sb
    .from('bookings')
    .select('period, start_date, end_date')
    .eq('property_id', body.property_id)
    .in('status', ['paid', 'active'])
    .order('start_date', { ascending: true });
  if (error) {
    console.error('[property-availability] query error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  const rows = (data as Row[] | null) ?? [];

  // Un bail au MOIS immobilise le logement sans date de fin connue. On ne peut
  // pas le rendre comme une plage : on le signale a part, et l'app grise tout.
  const blockedByMonthly = rows.some((r) => r.period === 'month');

  // Plages journalieres, bornes de sortie EXCLUES : un depart le 27 libere le
  // 27 pour l'arrivee suivante, comme dans l'hotellerie. C'est aussi la
  // convention de la garde de chevauchement de booking-request
  // (b.start_date < endStr && start_date < b.end_date), et les deux doivent
  // rester d'accord sous peine d'afficher libre une nuit refusee a l'envoi.
  const ranges = rows
    .filter((r) => r.period === 'day' && r.end_date)
    .map((r) => ({ start: r.start_date, end: r.end_date as string }));

  return { body: { blocked_by_monthly: blockedByMonthly, ranges } };
}));
