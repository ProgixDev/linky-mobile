// Phase P.5 — admin manual KYC decision (the client-required fallback for
// in_review cases and docs Didit can't auto-verify, e.g. private homeowners).
//
// Body : { session_id: string (kyc_sessions.id), outcome: 'approve' | 'decline', reason?: string }
// Response : { ok: true, status: 'approved' | 'declined' }
//
// Auth : requireUser + assertAdmin. Only OPEN sessions (pending / in_review)
// can be manually decided — terminal sessions are immutable here ; a
// re-verification goes through a fresh kyc-start session instead.
//
// Routes through the same applyKycDecision path as the webhook (users mirror,
// shops.verified flip, push notification), then appends the admin_actions
// audit row (Phase K convention).
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';
import { applyKycDecision } from '@shared/didit.ts';

interface Body {
  session_id: string;
  outcome: 'approve' | 'decline';
  reason?: string;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.session_id !== 'string' || !UUID_RE.test(x.session_id)) return false;
  if (x.outcome !== 'approve' && x.outcome !== 'decline') return false;
  if (x.reason !== undefined && (typeof x.reason !== 'string' || x.reason.length > 500)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/admin/kyc/decide', valid, async ({ sb, body, req }) => {
  const adminId = await requireUser(req);
  await assertAdmin(sb, adminId);

  const { data: session, error: sessErr } = await sb
    .from('kyc_sessions')
    .select('id, didit_session_id, status, user_id')
    .eq('id', body.session_id)
    .maybeSingle();
  if (sessErr) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  if (!session) throwApi('KYC_SESSION_NOT_FOUND', 404, 'Session introuvable.');
  if (session.status !== 'pending' && session.status !== 'in_review') {
    throwApi('KYC_SESSION_CLOSED', 409, 'Cette session est déjà tranchée.');
  }

  const before = session.status as string;
  const applied = await applyKycDecision(
    sb,
    session.didit_session_id as string,
    body.outcome === 'approve' ? 'Approved' : 'Declined',
    null, // keep Didit's stored decision payload untouched
    `manual:${adminId}`,
  );
  // The open-session guard inside applyKycDecision backstops the pre-check
  // above : a webhook landing between the two reads turns this into 'noop'.
  if (applied === 'noop') throwApi('KYC_SESSION_CLOSED', 409, 'Cette session est déjà tranchée.');
  if (applied === 'unknown') throwApi('KYC_SESSION_NOT_FOUND', 404, 'Session introuvable.');
  if (applied === 'error') throwApi('INTERNAL_ERROR', 500, 'Erreur application décision');

  const { error: auditErr } = await sb.from('admin_actions').insert({
    admin_id: adminId,
    target_type: 'kyc_session',
    target_id: session.id,
    action: body.outcome === 'approve' ? 'kyc.approve' : 'kyc.decline',
    reason: body.reason ?? null,
    before_snapshot: { status: before },
    after_snapshot: { status: applied },
  });
  if (auditErr) console.error('[kyc-decide] audit insert failed:', auditErr);

  return { body: { ok: true, status: applied } };
}));
