// LE JUMEAU DE order-paid-push, POUR LES RESERVATIONS.
//
// ┌─ LE TROU QU'IL BOUCHE ──────────────────────────────────────────────────┐
// « Reservation payee » n'etait envoyee que par stripe-webhook. Or Stripe ne
// sert que les profils de la diaspora : en Guinee, un locataire paie par
// Orange/MTN (rail Lengopay, confirme par le cron) ou par son portefeuille
// Linky (instantane, dans booking-sign-pay). Sur ces deux chemins — les seuls
// que la quasi-totalite des utilisateurs emprunte — le PROPRIETAIRE n'apprenait
// JAMAIS que son locataire avait paye. Il devait ouvrir l'application et
// regarder.
//
// C'est exactement le reproche du client du 2026-09-28 : « ils peuvent recevoir
// une commande, reservation ou livraison sans le savoir ». Ici ce n'etait meme
// pas une question de son : aucune notification ne partait.
// └─────────────────────────────────────────────────────────────────────────┘
//
// Entierement sous try/catch : l'argent est deja au sequestre quand on arrive
// ici, une notification qui echoue ne doit surtout pas faire echouer l'appelant
// (le cron rejouerait le sondage, le webhook ferait rejouer Stripe).
import type { SupabaseClient } from '@shared/db.ts';
import { notifyDetached, formatGNF } from '@shared/push.ts';

interface BookingRow {
  id: string;
  landlord_id: string;
  tenant_id: string;
  status: string;
  total_minor: number | string;
  property_snapshot: { title?: string } | null;
}

/**
 * Previent le bailleur (et confirme au locataire) qu'une reservation est payee.
 *
 * Relit le statut EN BASE plutot que de faire confiance a l'appelant : les trois
 * chemins de paiement arrivent ici dans des etats differents, et seul 'paid'
 * signifie que le sequestre detient reellement le loyer.
 */
export async function notifyBookingPaid(sb: SupabaseClient, bookingId: string): Promise<void> {
  try {
    const { data, error } = await sb
      .from('bookings')
      .select('id, landlord_id, tenant_id, status, total_minor, property_snapshot')
      .eq('id', bookingId)
      .maybeSingle();
    if (error || !data) {
      if (error) console.error('[booking-paid-push] fetch failed:', error);
      return;
    }
    const bk = data as unknown as BookingRow;
    // Un encaissement sur une reservation annulee ou deja remboursee existe
    // (conflit de dates, doublon de rail) : il ne faut surtout pas annoncer au
    // bailleur un loyer qui ne lui reviendra pas.
    if (bk.status !== 'paid') return;

    const title = bk.property_snapshot?.title ?? 'ton bien';
    const amount = formatGNF(Number(bk.total_minor));

    notifyDetached(sb, {
      userIds: [bk.landlord_id],
      category: 'booking',
      kind: 'success',
      title: 'Réservation payée',
      body: `Le contrat pour « ${title} » est signé — ${amount} sont sécurisés en séquestre.`,
      iconHint: 'check',
      deeplink: `/agent/leases/${bk.id}`,
      refType: 'booking',
      refId: bk.id,
      app: 'marketplace',
    });

    // LE LOCATAIRE AUSSI. Sur mobile money il quitte l'application pour payer et
    // revient sans rien savoir : c'est le « paiement accepte » que le client
    // demande d'entendre. Le bailleur et lui ne recoivent pas le meme message —
    // l'un doit preparer la remise des cles, l'autre veut juste etre rassure.
    notifyDetached(sb, {
      userIds: [bk.tenant_id],
      category: 'booking',
      kind: 'success',
      title: 'Paiement confirmé',
      body: `Ton paiement de ${amount} pour « ${title} » est bien arrivé. Le propriétaire est prévenu.`,
      iconHint: 'check',
      deeplink: `/bookings/${bk.id}`,
      refType: 'booking',
      refId: bk.id,
      app: 'marketplace',
    });
  } catch (e) {
    console.error('[booking-paid-push] notifyBookingPaid failed:', e);
  }
}
