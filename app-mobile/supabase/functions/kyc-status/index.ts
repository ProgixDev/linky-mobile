// Phase P.3 — KYC status poll (the safety net for missed webhooks).
//
// Body : {}
// Response : { kyc_status, session: { status, updated_at } | null }
//
// Auth : requireUser.
//
// When the latest session is still open AND its row hasn't been touched in
// STALE_MS, we re-fetch the decision from Didit and run it through the same
// applyKycDecision path the webhook uses. The threshold keeps the 2s mobile
// poll from hammering Didit — at most one provider call per STALE_MS.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { diditConfig, getDiditDecision, applyKycDecision } from '@shared/didit.ts';

type Body = Record<string, never>;

function valid(b: unknown): b is Body {
  return typeof b === 'object' && b !== null;
}

const STALE_MS = 10_000;

Deno.serve(makePost<Body>('/v1/kyc/status', valid, async ({ sb, req }) => {
  const userId = await requireUser(req);

  const { data: session, error: sessErr } = await sb
    .from('kyc_sessions')
    .select('didit_session_id, status, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sessErr) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');

  let sessionStatus = session?.status as string | undefined;
  const isOpen = sessionStatus === 'pending' || sessionStatus === 'in_review';
  const stale = session && Date.now() - new Date(session.updated_at as string).getTime() > STALE_MS;

  if (session && isOpen && stale && diditConfig()) {
    try {
      const decision = await getDiditDecision(session.didit_session_id as string);
      const applied = await applyKycDecision(
        sb, session.didit_session_id as string, decision.status, decision, 'poll',
      );
      // applyKycDecision may also return 'noop' | 'unknown' | 'error' — only
      // a real status updates the local view.
      if (applied !== 'noop' && applied !== 'unknown' && applied !== 'error') {
        sessionStatus = applied;
      }
    } catch (e) {
      // Poll refresh is best-effort ; the webhook remains the primary channel.
      // Didit's /decision/ endpoint 404s before any decision exists, which
      // lands here on every early poll — re-arm the throttle by touching
      // updated_at, otherwise EVERY 2.5s poll makes a provider call.
      console.error('[kyc-status] poll refresh failed:', e);
      await sb
        .from('kyc_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('didit_session_id', session.didit_session_id as string)
        .in('status', ['pending', 'in_review']);
    }
  }

  const { data: user, error: userErr } = await sb
    .from('users').select('kyc_status').eq('id', userId).maybeSingle();
  if (userErr || !user) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');

  return {
    body: {
      kyc_status: user.kyc_status,
      session: session ? { status: sessionStatus, updated_at: session.updated_at } : null,
    },
  };
}));
