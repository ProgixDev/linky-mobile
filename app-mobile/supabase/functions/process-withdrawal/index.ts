// Phase S — admin marks a withdrawal request paid or rejected.
//
// V1 payout is MANUAL : the admin sends the mobile-money transfer OUTSIDE the
// app, then calls this to record it. 'paid' debits the seller wallet at payout
// time (one-sided EXTERNAL EXIT, ref_type='withdrawal_payout') inside the
// process_withdrawal RPC — which also re-checks the balance under lock (funds
// are not held at request time) and writes the admin_actions audit row
// ('withdrawal.paid' / 'withdrawal.rejected') atomically with the mutation.
//
// Body : { request_id: string, outcome: 'paid' | 'rejected', reason?: string }
//        reason is REQUIRED when outcome='rejected'.
// Response : { ok: true, withdrawal: <updated row> }
//
// Error map (RPC raise → HTTP) :
//   not_admin          → 403 FORBIDDEN_ADMIN
//   user_not_found     → 404 USER_NOT_FOUND
//   invalid_outcome    → 400 INVALID_OUTCOME   (validator catches first)
//   reason_required    → 400 REASON_REQUIRED   (handler catches first)
//   request_not_found  → 404 REQUEST_NOT_FOUND
//   request_closed     → 409 REQUEST_CLOSED    (already decided / cancelled)
//   insufficient_funds → 409 INSUFFICIENT_FUNDS (seller spent since requesting)
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';
import { notifyDetached, formatGNF } from '@shared/push.ts';

interface Body {
  request_id: string;
  outcome: 'paid' | 'rejected';
  reason?: string;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.request_id !== 'string' || !UUID_RE.test(x.request_id)) return false;
  if (x.outcome !== 'paid' && x.outcome !== 'rejected') return false;
  if (x.reason !== undefined && (typeof x.reason !== 'string' || x.reason.length > 500)) return false;
  return true;
}

interface WithdrawalRow {
  id: string;
  user_id: string;
  currency: string;
  amount_minor: number | string;
  status: string;
  destination: string | null;
  reason: string | null;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
}

Deno.serve(makePost<Body>('/v1/admin/withdrawals/process', valid, async ({ sb, body, req }) => {
  const adminId = await requireUser(req);
  await assertAdmin(sb, adminId);

  if (body.outcome === 'rejected' && !(body.reason ?? '').trim()) {
    throwApi('REASON_REQUIRED', 400, 'Un motif est requis pour rejeter un retrait.');
  }

  const { data, error: rpcErr } = await sb.rpc('process_withdrawal', {
    p_request_id: body.request_id,
    p_admin_id:   adminId,
    p_outcome:    body.outcome,
    p_reason:     body.reason ?? null,
  });
  if (rpcErr) {
    const msg = (rpcErr as { message?: string } | null)?.message ?? '';
    console.error('[process-withdrawal] rpc error:', rpcErr);
    if (msg.includes('not_admin'))          throwApi('FORBIDDEN_ADMIN',    403, 'Accès admin requis.');
    if (msg.includes('user_not_found'))     throwApi('USER_NOT_FOUND',     404, 'Utilisateur inconnu.');
    if (msg.includes('invalid_outcome'))    throwApi('INVALID_OUTCOME',    400, 'Décision invalide (paid ou rejected).');
    if (msg.includes('reason_required'))    throwApi('REASON_REQUIRED',    400, 'Un motif est requis pour rejeter un retrait.');
    if (msg.includes('request_not_found'))  throwApi('REQUEST_NOT_FOUND',  404, 'Demande de retrait introuvable.');
    if (msg.includes('request_closed'))     throwApi('REQUEST_CLOSED',     409, 'Cette demande est déjà traitée.');
    if (msg.includes('insufficient_funds')) throwApi('INSUFFICIENT_FUNDS', 409, 'Le solde du vendeur ne couvre plus ce retrait.');
    throwApi('INTERNAL_ERROR', 500, 'Erreur traitement du retrait');
  }

  const row = (Array.isArray(data) ? data[0] : data) as WithdrawalRow | undefined;
  if (!row) {
    console.error('[process-withdrawal] rpc returned no row');
    throwApi('INTERNAL_ERROR', 500, 'Erreur traitement du retrait');
  }

  // Push to the seller (best-effort, after the state change). Amount comes
  // from the REQUEST row ; operator label from its destination when present.
  const amount = formatGNF(Number(row.amount_minor));
  const operator = (row.destination ?? '').trim() || 'mobile money';
  if (body.outcome === 'paid') {
    notifyDetached(sb, {
      userIds: [row.user_id],
      category: 'system',
      title: 'Retrait effectué',
      body: `${amount} envoyé sur ton compte ${operator}.`,
      iconHint: 'check',
      deeplink: '/wallet',
    });
  } else {
    notifyDetached(sb, {
      userIds: [row.user_id],
      category: 'system',
      title: 'Retrait refusé',
      body: `Ton retrait de ${amount} n'a pas été effectué : ${row.reason ?? 'voir le support'}. Ton solde reste inchangé.`,
      iconHint: 'shield',
      deeplink: '/wallet',
    });
  }

  return { body: { ok: true, withdrawal: row } };
}));
