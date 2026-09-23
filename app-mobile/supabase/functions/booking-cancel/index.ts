// Le locataire annule sa propre reservation.
//
// DEUX CAS, UN SEUL BOUTON. Avant paiement (requested/accepted), rien n'a bouge :
// la reservation passe en 'cancelled'. APRES paiement, l'argent est en sequestre :
// le client a demande le 2026-09-23 une sortie « jusqu'a 48h avant la date
// d'emmenagement », et c'est cancel_paid_booking qui rend le total au locataire
// (20260923_01). Un seul endpoint, parce que c'est un seul geste cote
// utilisateur ; la base decide quelle machinerie s'applique.
//
// LA FENETRE DES 48 H EST TRANCHEE PAR LE SERVEUR, jamais par l'ecran. Un
// telephone a l'heure fausse, un bundle perime ou un appel direct ne doivent pas
// pouvoir rendre de l'argent hors delai.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { notifyDetached, displayNameOf } from '@shared/push.ts';

interface Body { booking_id: string }

const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  return typeof x.booking_id === 'string' && UUID_RE.test(x.booking_id);
}

Deno.serve(makePost<Body>('/v1/bookings/cancel', valid, async ({ sb, body, req }) => {
  const tenantId = await requireUser(req);

  const { data: bk, error: eBk } = await sb
    .from('bookings')
    .select('id, tenant_id, landlord_id, status, period, start_date, events, property_snapshot')
    .eq('id', body.booking_id)
    .maybeSingle();
  if (eBk) { console.error('[booking-cancel] lookup:', eBk); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
  if (!bk) throwApi('BOOKING_NOT_FOUND', 404, 'Réservation introuvable.');
  if (bk.tenant_id !== tenantId) throwApi('FORBIDDEN', 403, 'Action refusée.');
  // RESERVATION PAYEE : remboursement, si la fenetre est encore ouverte.
  if (bk.status === 'paid') {
    const { data: rpc, error: eRpc } = await sb.rpc('cancel_paid_booking', {
      p_booking_id: bk.id,
      p_tenant_id: tenantId,
    });
    if (eRpc) {
      // Les exceptions nommees de la fonction SQL deviennent des codes d'API :
      // le locataire doit lire POURQUOI, pas une erreur technique.
      const m = eRpc.message ?? '';
      if (m.includes('CANCEL_WINDOW_CLOSED')) {
        throwApi('CANCEL_WINDOW_CLOSED', 409,
          "Trop tard pour annuler : c'est possible jusqu'à 48 h avant l'emménagement.");
      }
      if (m.includes('NOT_CANCELLABLE')) {
        throwApi('NOT_CANCELLABLE', 409, "Cet achat ne peut pas être annulé depuis l'application.");
      }
      if (m.includes('FORBIDDEN')) throwApi('FORBIDDEN', 403, 'Action refusée.');
      if (m.includes('INVALID_STATUS')) {
        throwApi('INVALID_STATUS', 409, "Cette réservation a déjà changé d'état.");
      }
      console.error('[booking-cancel] refund rpc:', eRpc);
      throwApi('INTERNAL_ERROR', 500, 'Erreur lors du remboursement');
    }
    if (rpc !== 'refunded') {
      console.error('[booking-cancel] refund rpc returned:', rpc);
      throwApi('INTERNAL_ERROR', 500, 'Erreur lors du remboursement');
    }

    const tenantNameRefund = await displayNameOf(sb, tenantId);
    const titleRefund = ((bk.property_snapshot as { title?: string } | null)?.title) ?? 'votre bien';
    notifyDetached(sb, {
      userIds: [bk.landlord_id as string],
      category: 'booking',
      title: 'Réservation annulée',
      body: `${tenantNameRefund} a annulé sa réservation pour « ${titleRefund} ». Le montant lui a été remboursé.`,
      iconHint: 'shield',
      deeplink: `/agent/leases/${bk.id}`,
      refType: 'booking',
      refId: bk.id,
      app: 'marketplace',
    });
    return { body: { ok: true, refunded: true } };
  }

  if (bk.status !== 'requested' && bk.status !== 'accepted') {
    throwApi('INVALID_STATUS', 409, 'Cette réservation ne peut plus être annulée dans l\'application.');
  }

  const events = Array.isArray(bk.events) ? bk.events : [];
  const { data: updated, error: eUp } = await sb
    .from('bookings')
    .update({
      status: 'cancelled',
      events: [...events, { at: new Date().toISOString(), label: 'Réservation annulée par le locataire' }],
      updated_at: new Date().toISOString(),
    })
    .eq('id', bk.id)
    .in('status', ['requested', 'accepted'])
    .select('id')
    .maybeSingle();
  if (eUp) { console.error('[booking-cancel] update:', eUp); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
  if (!updated) throwApi('INVALID_STATUS', 409, 'Cette réservation a déjà changé d\'état.');

  const tenantName = await displayNameOf(sb, tenantId);
  const title = ((bk.property_snapshot as { title?: string } | null)?.title) ?? 'votre bien';
  notifyDetached(sb, {
    userIds: [bk.landlord_id as string],
    category: 'booking',
    title: 'Réservation annulée',
    body: `${tenantName} a annulé sa demande pour « ${title} ».`,
    iconHint: 'shield',
    deeplink: `/agent/leases/${bk.id}`,
    refType: 'booking',
    refId: bk.id,
    app: 'marketplace',
  });

  return { body: { ok: true, refunded: false } };
}));
