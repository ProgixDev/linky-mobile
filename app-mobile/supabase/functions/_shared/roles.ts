// Le rôle « acheteur », vérifié côté SERVEUR.
//
// DEMANDE DU CLIENT, 2026-09-08 23:01 : « On ne peut pas faire de commande ni
// louer si le mode Acheteur n'est pas activé. » L'application pose déjà le
// verrou sur chaque bouton (src/lib/persona.ts + BuyerGate), mais un verrou qui
// ne vit que dans l'écran n'est pas la règle : c'est une suggestion. Un bundle
// périmé, un lien profond, une requête rejouée y échappent.
//
// POURQUOI C'EST SUFFISANT ICI. RLS est activé SANS AUCUNE policy sur orders,
// order_items, bookings et visit_requests, et les fonctions edge tournent avec
// la clé service_role. Autrement dit ces quatre points d'entrée SONT toute la
// surface d'écriture : les verrouiller ferme la porte pour de bon. (Corollaire :
// RLS ne pourra jamais servir de garde ici — service_role la contourne.)
//
// POURQUOI ON RELIT LA LIGNE PLUTÔT QUE LE JETON. Les rôles ne sont pas dans le
// JWT (AccessClaims = { sub, iat, exp, role }, où `role` est celui de PostgREST,
// pas le nôtre). La lecture est donc toujours fraîche : désactiver « Acheteur »
// mord dès la requête suivante, sans fenêtre de jeton périmé.
//
// ⚠️ CE QU'IL NE FAUT SURTOUT PAS VERROUILLER AVEC ÇA. Ce garde protège
// l'ENGAGEMENT, jamais ce qui est déjà engagé. De l'argent dort au séquestre, et
// toutes les sorties de séquestre sont des appels côté acheteur :
//   confirm-receipt, booking-checkin-confirm, dispute-order,
//   cancel-pending-payment, booking-cancel, create-review
// y ajouter un contrôle de rôle transformerait un interrupteur de profil en
// moyen d'enfermer quelqu'un hors de son propre argent. Chacune vérifie déjà la
// seule chose qui compte : l'appelant EST l'acheteur de cette ligne.
//
// Et surtout pas lengopay-confirm-otp : il porte le code d'un paiement DÉJÀ en
// vol chez Orange/MTN. Un 403 à cet endroit laisse quelqu'un débité sans trace.
//
// booking-sign-pay est le seul cas discutable, et il reste OUVERT : c'est la
// suite d'un accord que le propriétaire a déjà accepté et signé. Le verrouiller
// laisserait un locataire devant une réservation acceptée qu'il ne peut pas
// payer, pendant que le bien du propriétaire reste bloqué par la garde de
// chevauchement. La location à la journée est en réservation immédiate : cette
// fenêtre fait une tape de large et serait atteinte.
import type { SupabaseClient } from '@shared/db.ts';
import { throwApi } from '@shared/errors.ts';

/**
 * Refuse la requête si le compte n'a pas le rôle 'buyer'.
 *
 * À appeler juste après requireUser(), AVANT la moindre écriture — un lot de
 * commandes à moitié constitué serait pire qu'un refus immédiat.
 */
export async function requireBuyerRole(sb: SupabaseClient, userId: string): Promise<void> {
  const { data, error } = await sb.from('users').select('roles').eq('id', userId).single();
  if (error || !data) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  const roles: string[] = Array.isArray(data.roles) ? (data.roles as string[]) : [];
  if (!roles.includes('buyer')) {
    throwApi(
      'ROLE_REQUIRED',
      403,
      'Active le mode Acheteur dans ton profil pour commander ou louer.',
    );
  }
}
