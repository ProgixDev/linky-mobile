// Phase P.5 — admin KYC queue.
//
// Body : { scope?: 'open' | 'recent' }   (default 'open')
//   open   → pending + in_review sessions, oldest first (work queue order)
//   recent → terminal sessions decided in the last 7 days, newest first
// Response : { sessions: KycSessionRow[] }
//
// Auth : requireUser + assertAdmin (live is_admin re-check, Phase K posture).
// `decision` is Didit's opaque payload — the console renders the
// "vérifications automatiques" panel straight from it.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';

interface Body {
  scope?: 'open' | 'recent';
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  return x.scope === undefined || x.scope === 'open' || x.scope === 'recent';
}

const SELECT =
  'id, status, decision, decided_via, created_at, updated_at, completed_at, ' +
  'users:users(id, display_name, avatar_url, kyc_status)';

Deno.serve(makePost<Body>('/v1/admin/kyc/list', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);
  await assertAdmin(sb, userId);

  const scope = body.scope ?? 'open';
  let query = sb.from('kyc_sessions').select(SELECT);

  if (scope === 'open') {
    query = query.in('status', ['pending', 'in_review']).order('created_at', { ascending: true });
  } else {
    const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    query = query
      .in('status', ['approved', 'declined', 'expired'])
      .gte('completed_at', cutoff)
      .order('completed_at', { ascending: false });
  }

  const { data, error } = await query.limit(100);
  if (error) {
    console.error('[list-kyc-sessions] select error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  return { body: { sessions: data ?? [] } };
}));
