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
//
// « AVANT PAIEMENT, RIEN N'A BOUGE » EST FAUX PENDANT QUE LE RAIL TRAVAILLE.
// Une reservation reste 'accepted' tant que le cron n'a pas confirme
// l'encaissement, et l'ecran laisse deliberement « Annuler la demande » visible
// pendant ce temps. Le locataire pouvait donc valider son USSD Orange — l'argent
// quitte son compte — puis annuler avant le sondage : la reservation passait
// 'cancelled', et au sondage suivant confirm_booking_payment rendait 'noop'
// (elle n'est plus 'accepted'), sans meme un warning. Debite, aucune ecriture au
// grand livre, aucune trace. booking-sign-pay decrit ce mecanisme mot pour mot
// pour le cas de la double intention et l'a ferme ; cette porte-la etait restee
// ouverte.
//
// UN REMBOURSEMENT NE SE DECLENCHE PAS PAR ACCIDENT. L'appelant doit dire dans
// quel etat il croyait la reservation (expected_status). Le cache de l'app tient
// 5 minutes et ne se rafraichit pas au retour au premier plan
// (src/lib/queryClient.ts) : un ecran reste sur 'accepted' alors que le cron
// venait de passer a 'paid' aurait rembourse pour de vrai, sous un bouton sans
// alerte et avec le message « Reservation annulee. ». On refuse desormais, et
// l'app se rafraichit.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { notifyDetached, displayNameOf } from '@shared/push.ts';
import { intentIsLive } from '@shared/lengopay.ts';

interface Body {
  booking_id: string;
  /** L'etat dans lequel l'ECRAN croyait la reservation. Absent = bundle ancien,
   *  qui n'a aucun bouton pour rembourser : on ne remboursera donc pas pour lui. */
  expected_status?: 'requested' | 'accepted' | 'paid';
}

const UUID_RE = /^[0-9a-f-]{36}$/i;
const EXPECTED = ['requested', 'accepted', 'paid'];

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.booking_id !== 'string' || !UUID_RE.test(x.booking_id)) return false;
  if (x.expected_status !== undefined
      && (typeof x.expected_status !== 'string' || !EXPECTED.includes(x.expected_status))) return false;
  return true;
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
    // L'ecran doit avoir VU 'paid' — donc avoir affiche l'alerte qui annonce le
    // montant rendu. Sinon c'est un cache en retard, et le geste de
    // l'utilisateur portait sur « Annuler la demande », pas sur un remboursement.
    if (body.expected_status !== 'paid') {
      throwApi('STATUS_CHANGED', 409,
        'Ta reservation vient d’etre payee. Rouvre-la pour voir les options d’annulation.');
    }
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

  // UN PAIEMENT EN VOL INTERDIT L'ANNULATION. Meme borne d'age que partout
  // ailleurs (INTENT_TTL_MS, 15 min) : passee cette limite l'intention est morte
  // pour les balayages, elle ne doit pas bloquer la reservation pour toujours.
  // Le prefixe 'pending-init-' marque une ligne posee AVANT l'appel au rail :
  // rien n'a encore ete demande au locataire, il n'y a donc rien a proteger.
  const { data: livePi, error: ePi } = await sb
    .from('payment_intents')
    .select('id, rail_intent_id, created_at')
    .eq('booking_id', bk.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ePi) { console.error('[booking-cancel] intents:', ePi); throwApi('INTERNAL_ERROR', 500, 'Erreur base de donnees'); }
  if (livePi && intentIsLive(livePi.created_at) && !String(livePi.rail_intent_id).startsWith('pending-init-')) {
    throwApi('PAYMENT_IN_PROGRESS', 409,
      'Un paiement est en cours sur cette reservation. Attends son issue avant d’annuler — si tu as deja valide sur ton telephone, elle va etre confirmee.');
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
