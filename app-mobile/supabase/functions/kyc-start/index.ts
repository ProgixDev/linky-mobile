// Phase P.3 — start (or resume) a Didit hosted verification session.
//
// Body : {}
// Response : {
//   kyc_status: 'none'|'pending'|'in_review'|'approved'|'declined',
//   session: { url: string | null, status: string } | null
// }
//
// Auth : requireUser.
//
// Session reuse (saves Didit credits, mirrors provider semantics) :
//   - approved        → no session, nothing to do
//   - open in_review  → no URL (a human is reviewing ; re-opening the hosted
//                       flow would orphan the reviewed session)
//   - open pending    → reuse its stored verification_url
//   - otherwise       → create a fresh Didit session
//
// 503 KYC_NOT_CONFIGURED when LINKY_DIDIT_* secrets are absent — the app
// degrades to "bientôt disponible" instead of erroring.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { diditConfig, createDiditSession } from '@shared/didit.ts';

type Body = Record<string, never>;

function valid(b: unknown): b is Body {
  return typeof b === 'object' && b !== null;
}

Deno.serve(makePost<Body>('/v1/kyc/start', valid, async ({ sb, req }) => {
  const userId = await requireUser(req);

  const { data: user, error: userErr } = await sb
    .from('users').select('kyc_status').eq('id', userId).maybeSingle();
  if (userErr || !user) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  if (user.kyc_status === 'approved') {
    return { body: { kyc_status: 'approved', session: null } };
  }

  if (!diditConfig()) throwApi('KYC_NOT_CONFIGURED', 503, 'Vérification bientôt disponible.');

  const { data: open, error: openErr } = await sb
    .from('kyc_sessions')
    .select('didit_session_id, status, verification_url')
    .eq('user_id', userId)
    .in('status', ['pending', 'in_review'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (openErr) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');

  if (open?.status === 'in_review') {
    return { body: { kyc_status: 'in_review', session: { url: null, status: 'in_review' } } };
  }
  if (open?.status === 'pending' && open.verification_url) {
    return { body: { kyc_status: 'pending', session: { url: open.verification_url, status: 'pending' } } };
  }

  const callbackUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/kyc-callback`;
  let created;
  try {
    created = await createDiditSession(userId, callbackUrl);
  } catch (e) {
    console.error('[kyc-start] createSession failed:', e);
    throwApi('KYC_PROVIDER_ERROR', 502, 'Le service de vérification est indisponible. Réessaie plus tard.');
  }

  const { error: insErr } = await sb.from('kyc_sessions').insert({
    user_id: userId,
    didit_session_id: created.session_id,
    workflow_id: created.workflow_id ?? Deno.env.get('LINKY_DIDIT_WORKFLOW_ID'),
    status: 'pending',
    verification_url: created.url,
  });
  if (insErr) {
    // 23505 on kyc_sessions_one_open_per_user : a concurrent kyc-start won
    // the race. Hand back the winner's URL ; our just-created Didit session
    // is orphaned (logged) and expires on Didit's side without ever having
    // a local row — the open-session guard means it can't touch the mirror.
    if ((insErr as { code?: string }).code === '23505') {
      console.log('[kyc-start] concurrent start — reusing winner session, orphaning', created.session_id);
      const { data: winner } = await sb
        .from('kyc_sessions')
        .select('status, verification_url')
        .eq('user_id', userId)
        .in('status', ['pending', 'in_review'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (winner) {
        return {
          body: {
            kyc_status: winner.status,
            session: { url: winner.status === 'pending' ? winner.verification_url : null, status: winner.status },
          },
        };
      }
    }
    console.error('[kyc-start] session insert failed:', insErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur enregistrement session');
  }

  // Mirror immediately so the profile chip shows "en cours" without waiting
  // for the first webhook.
  await sb.from('users').update({ kyc_status: 'pending' }).eq('id', userId);

  return { body: { kyc_status: 'pending', session: { url: created.url, status: 'pending' } } };
}));
