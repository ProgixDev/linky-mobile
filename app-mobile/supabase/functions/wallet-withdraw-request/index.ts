import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body { currency: 'GNF' | 'EUR'; amount_minor: number; destination?: string }

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Body;
  return (x.currency === 'GNF' || x.currency === 'EUR')
    && typeof x.amount_minor === 'number' && Number.isInteger(x.amount_minor) && x.amount_minor > 0
    && x.amount_minor <= 100_000_000_000
    && (x.destination === undefined || (typeof x.destination === 'string' && x.destination.length <= 128));
}

// Records a PENDING withdrawal request after a read-only balance check. No debit happens here -
// V1 payout is manual; the ledger debit (post_external_debit) lands with the payments module.
Deno.serve(makePost<Body>(
  '/v1/wallet/withdraw-request',
  valid,
  async ({ sb, body, req }) => {
    const userId = await requireUser(req);
    const { data: balances, error: be } = await sb.rpc('get_wallet_balances', { p_user_id: userId });
    if (be) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
    const row = ((balances ?? []) as Array<{ currency: string; balance_minor: number }>).find((x) => x.currency === body.currency);
    const bal = Number(row?.balance_minor ?? 0);
    if (bal < body.amount_minor) throwApi('INSUFFICIENT_FUNDS', 400, 'Solde insuffisant pour ce retrait.');
    const { data, error } = await sb
      .from('withdrawal_requests')
      .insert({ user_id: userId, currency: body.currency, amount_minor: body.amount_minor, destination: body.destination ?? null })
      .select('id, currency, amount_minor, status, destination, created_at')
      .single();
    if (error || !data) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
    return { body: { withdrawal: data } };
  },
));
