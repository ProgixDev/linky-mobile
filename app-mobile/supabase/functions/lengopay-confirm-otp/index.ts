// Kulu — confirmation du code de validation recu par SMS.
//
// Client 2026-09-05 : « page de paiement In App Carte bancaire + Wallet
// (Paycard, Kulu et Soutra money) ». Kulu est le seul rail Lengopay a demander
// un aller-retour de plus : l'init rend requires_otp, l'acheteur recoit un code
// sur son telephone, et il faut le renvoyer a POST /api/v2/authenticate.
//
// CE QUE CETTE FONCTION NE FAIT PAS, ET C'EST DELIBERE : elle ne marque RIEN
// comme paye. Lengopay accuse seulement reception du code ; c'est le sondage
// habituel (cron-poll-intents -> getPaymentStatusV2) qui tranche le sort de
// l'argent, exactement comme pour Orange et MTN. Crediter le sequestre sur la
// foi d'un accuse de reception, ce serait payer un vendeur sur la promesse d'un
// virement.
//
// LA VERIFICATION DE PROPRIETE EST LA RAISON D'ETRE DE CE FICHIER.
// Le pay_id vient du client. Sans controle, n'importe qui pourrait confirmer le
// paiement d'un autre — ou pilonner des codes sur l'intention d'un inconnu. On
// remonte donc de l'intention jusqu'a son proprietaire reel, quel que soit
// l'objet qu'elle regle (commande, lot, reservation, boost : la contrainte
// payment_intents_one_target garantit qu'il y en a exactement un).

import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { confirmPaymentV2 } from '@shared/lengopay.ts';

interface Body {
  /** Le rail_intent_id de l'intention (pay_id Lengopay), tel que rendu a l'init. */
  pay_id: string;
  /** Le code recu par SMS. */
  code: string;
}

// pay_id est du base64 AVEC padding cote Lengopay — jamais decode ni reencode.
// On borne seulement sa taille et son alphabet, pour ne pas transporter
// n'importe quoi jusqu'au rail.
const PAY_ID_RE = /^[A-Za-z0-9+/=_-]{8,256}$/;
// Longueur du code volontairement large : la doc Lengopay ne la fixe pas, et
// refuser un code valide parce qu'il fait 5 chiffres au lieu de 6 bloquerait un
// paiement pour rien.
const CODE_RE = /^[0-9A-Za-z]{3,12}$/;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.pay_id !== 'string' || !PAY_ID_RE.test(x.pay_id)) return false;
  return typeof x.code === 'string' && CODE_RE.test(x.code.trim());
}

Deno.serve(makePost<Body>('/v1/payments/confirm-otp', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  // Le placeholder 'pending-init-...' n'atteint jamais Lengopay : le rejeter ici
  // evite un appel au rail avec un identifiant qui n'existe pas chez lui.
  if (body.pay_id.startsWith('pending-init-')) {
    throwApi('INTENT_NOT_FOUND', 404, 'Paiement introuvable.');
  }

  const { data: intent, error: eIntent } = await sb
    .from('payment_intents')
    .select('id, status, method, rail, rail_intent_id, order_id, batch_id, booking_id, boost_id')
    .eq('rail', 'lengopay')
    .eq('rail_intent_id', body.pay_id)
    .maybeSingle();
  if (eIntent) {
    console.error('[lengopay-confirm-otp] intent lookup:', eIntent);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  // Meme enveloppe pour « n'existe pas » et, plus bas, pour « ne t'appartient
  // pas » : distinguer les deux dirait a un inconnu quels pay_id sont reels.
  if (!intent) throwApi('INTENT_NOT_FOUND', 404, 'Paiement introuvable.');

  // ─── Proprietaire reel de l'intention ─────────────────────────────────────
  let ownerId: string | null = null;
  if (intent.order_id) {
    const { data } = await sb.from('orders').select('buyer_id').eq('id', intent.order_id).maybeSingle();
    ownerId = data?.buyer_id ?? null;
  } else if (intent.batch_id) {
    // Un lot n'a qu'un acheteur (place_orders_batch les cree toutes pour le
    // meme buyer_id) : n'importe laquelle de ses commandes le designe.
    const { data } = await sb.from('orders').select('buyer_id').eq('batch_id', intent.batch_id).limit(1).maybeSingle();
    ownerId = data?.buyer_id ?? null;
  } else if (intent.booking_id) {
    const { data } = await sb.from('bookings').select('tenant_id').eq('id', intent.booking_id).maybeSingle();
    ownerId = data?.tenant_id ?? null;
  } else if (intent.boost_id) {
    const { data } = await sb.from('boosts').select('seller_id').eq('id', intent.boost_id).maybeSingle();
    ownerId = data?.seller_id ?? null;
  }
  if (!ownerId || ownerId !== userId) {
    console.warn('[lengopay-confirm-otp] tentative sur une intention qui ne lui appartient pas', {
      user_id: userId, intent_id: intent.id,
    });
    throwApi('INTENT_NOT_FOUND', 404, 'Paiement introuvable.');
  }

  // Une intention deja reglee (ou expiree) ne se confirme plus. Sans cette
  // garde, saisir un code sur un paiement abouti relancerait le rail pour rien
  // et laisserait croire a l'acheteur qu'il vient de payer une seconde fois.
  if (intent.status !== 'pending') {
    throwApi('INVALID_STATUS', 409, intent.status === 'completed'
      ? 'Ce paiement est déjà confirmé.'
      : "Ce paiement n'est plus en attente. Recommence la commande.");
  }
  // Seul Kulu passe par un code. Accepter ici un pay_id Orange/MTN enverrait un
  // /authenticate que le rail ne comprend pas.
  if (intent.method !== 'kulu') {
    throwApi('OTP_NOT_APPLICABLE', 400, "Ce moyen de paiement ne demande pas de code.");
  }

  let result;
  try {
    result = await confirmPaymentV2(body.pay_id, body.code.trim());
  } catch (e) {
    // Panne du rail (5xx / reseau). L'intention reste 'pending' : l'acheteur
    // peut retaper, et le balayage TTL reste le filet de securite. On ne
    // referme SURTOUT pas l'intention — le code a pu etre accepte avant que la
    // reponse se perde.
    console.error('[lengopay-confirm-otp] authenticate error:', e);
    throwApi('RAIL_UNAVAILABLE', 502, 'Le service de paiement ne répond pas. Réessaie dans un instant.');
  }

  if (!result.accepted) {
    // Code refuse : reponse NORMALE du rail, pas une panne. L'intention reste
    // ouverte pour un nouvel essai (la fenetre de 15 min borne les tentatives).
    throwApi('OTP_REJECTED', 400, 'Code incorrect. Vérifie le SMS et réessaie.');
  }

  // Code accepte. On note le passage sur l'intention pour le diagnostic, sans
  // toucher a `status` : le cron reste seul juge du sort de l'argent.
  const { error: eUpd } = await sb
    .from('payment_intents')
    .update({ rail_status: 'otp_confirmed', updated_at: new Date().toISOString() })
    .eq('id', intent.id);
  if (eUpd) {
    // Non bloquant : le code EST passe chez Lengopay, et le sondage decidera de
    // toute facon. Echouer ici ferait retaper un code deja consomme.
    console.error('[lengopay-confirm-otp] rail_status update failed (non bloquant):', eUpd);
  }

  return { body: { accepted: true } };
}));
