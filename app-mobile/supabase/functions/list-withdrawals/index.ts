// Phase S — admin withdrawals queue.
//
// Body : { scope?: 'pending' | 'recent' }   (default 'pending')
//   pending → pending requests, oldest first (work queue order), each with
//             the seller's CURRENT wallet balance (balance_minor) so the
//             console can flag "balance no longer covers this request" —
//             funds are NOT held at request time.
//   recent  → paid / rejected requests decided in the last 7 days, newest first.
// Response : { withdrawals: WithdrawalRow[] }
//
// Auth : requireUser + assertAdmin (live is_admin re-check, Phase K posture).
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';

interface Body {
  scope?: 'pending' | 'recent';
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  return x.scope === undefined || x.scope === 'pending' || x.scope === 'recent';
}

const SELECT =
  'id, user_id, currency, amount_minor, status, destination, reason, ' +
  'created_at, decided_at, decided_by, ' +
  'users:users!withdrawal_requests_user_id_fkey(id, display_name, avatar_url)';

interface WithdrawalRow {
  id: string;
  user_id: string;
  currency: string;
  amount_minor: number | string;
  status: string;
  [key: string]: unknown;
}

Deno.serve(makePost<Body>('/v1/admin/withdrawals/list', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);
  await assertAdmin(sb, userId);

  const scope = body.scope ?? 'pending';
  let query = sb.from('withdrawal_requests').select(SELECT);

  if (scope === 'pending') {
    query = query.eq('status', 'pending').order('created_at', { ascending: true });
  } else {
    const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    query = query
      .in('status', ['paid', 'rejected'])
      .gte('decided_at', cutoff)
      .order('decided_at', { ascending: false });
  }

  const { data, error } = await query.limit(100);
  if (error) {
    console.error('[list-withdrawals] select error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  const rows = (data ?? []) as unknown as WithdrawalRow[];

  if (scope === 'pending' && rows.length > 0) {
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const { data: balances, error: balErr } = await sb.rpc('get_wallet_balances_bulk', {
      p_user_ids: userIds,
    });
    if (balErr) {
      console.error('[list-withdrawals] balances error:', balErr);
      throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
    }
    const byUserCurrency = new Map<string, number>();
    for (const b of (balances ?? []) as Array<{ user_id: string; currency: string; balance_minor: number | string }>) {
      byUserCurrency.set(`${b.user_id}:${b.currency}`, Number(b.balance_minor));
    }
    for (const r of rows) {
      // No wallet row = nothing ever credited = balance 0.
      r.balance_minor = byUserCurrency.get(`${r.user_id}:${r.currency}`) ?? 0;
    }
  }

  return { body: { withdrawals: rows } };
}));
