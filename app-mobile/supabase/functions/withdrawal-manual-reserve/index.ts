// Reserver une demande AVANT de la virer a la main — ou relacher la reservation.
//
// ┌─ POURQUOI CE GESTE EXISTE ──────────────────────────────────────────────┐
// Depuis le 2026-10-28, le vendeur peut annuler son retrait. Le virement
// manuel se faisait en un seul clic, APRES avoir envoye l'argent : entre
// l'envoi et le clic, rien en base n'empechait l'annulation. Le vendeur
// voyait arriver le SMS de l'operateur, annulait, et gardait les deux.
//
// La reservation pose la meme empreinte que le versement Lengopay
// (`payout_claimed_at`, sous verrou) : l'annulation est refusee, et « Verser »
// aussi — pas de double envoi manuel + automatique. Ordre impose par la
// console : reserver -> virer -> confirmer (process-withdrawal 'paid').
// └─────────────────────────────────────────────────────────────────────────┘
//
// Body     : { request_id: string, action: 'reserve' | 'release' }
// Reponse  : { ok: true, withdrawal: <ligne> }
//
// Erreurs :
//   FORBIDDEN_ADMIN         403  pas admin
//   REQUEST_NOT_FOUND       404  demande inconnue
//   REQUEST_NOT_PAYABLE     409  la demande n'attend pas de virement (annulee…)
//   PAYOUT_ALREADY_CLAIMED  409  deja reservee, ou versement Lengopay parti
//   NOT_MANUALLY_RESERVED   409  rien a relacher (ou c'est un versement Lengopay)
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';

interface Body { request_id: string; action: 'reserve' | 'release' }

const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  return typeof x.request_id === 'string' && UUID_RE.test(x.request_id)
    && (x.action === 'reserve' || x.action === 'release');
}

Deno.serve(makePost<Body>('/v1/admin/withdrawals/manual-reserve', valid, async ({ sb, body, req }) => {
  const adminId = await requireUser(req);
  await assertAdmin(sb, adminId);

  const rpc = body.action === 'reserve'
    ? 'reserve_withdrawal_for_manual_payout'
    : 'release_manual_withdrawal_reservation';
  const { data, error } = await sb.rpc(rpc, {
    p_request_id: body.request_id,
    p_admin_id: adminId,
  });
  if (error) {
    const m = (error as { message?: string } | null)?.message ?? '';
    console.error('[withdrawal-manual-reserve] rpc error:', error);
    if (m.includes('not_admin'))              throwApi('FORBIDDEN_ADMIN', 403, 'Accès admin requis.');
    if (m.includes('request_not_found'))      throwApi('REQUEST_NOT_FOUND', 404, 'Demande de retrait introuvable.');
    if (m.includes('request_not_payable'))    throwApi('REQUEST_NOT_PAYABLE', 409, 'Cette demande n’attend plus de virement (annulée ou déjà traitée).');
    if (m.includes('payout_already_claimed')) throwApi('PAYOUT_ALREADY_CLAIMED', 409, 'Cette demande est déjà réservée, ou un versement Lengopay est parti.');
    if (m.includes('not_manually_reserved'))  throwApi('NOT_MANUALLY_RESERVED', 409, 'Aucune réservation manuelle à relâcher sur cette demande.');
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');

  return { body: { ok: true, withdrawal: row } };
}));
