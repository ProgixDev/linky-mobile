import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

// Returns the authenticated user's balances per currency. Balance is derived from the
// ledger (latest balance_after per wallet) via get_wallet_balances - never stored standalone.
Deno.serve(makePost<Record<string, unknown>>(
  '/v1/wallet/balance',
  (b): b is Record<string, unknown> => typeof b === 'object' && b !== null,
  async ({ sb, req }) => {
    const userId = await requireUser(req);
    // Les deux lectures partent ensemble : elles sont independantes et l'ecran
    // les affiche cote a cote.
    const [balances, breakdown] = await Promise.all([
      sb.rpc('get_wallet_balances', { p_user_id: userId }),
      sb.rpc('get_wallet_origin_breakdown', { p_user_id: userId }),
    ]);
    if (balances.error) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
    // LE DETAIL N'EST PAS BLOQUANT. Si sa lecture echoue, on rend le solde
    // seul : un ecran de portefeuille sans la ventilation reste utile, un
    // ecran en erreur ne l'est pas. Le client 2026-09-09 voulait savoir d'ou
    // vient l'argent, pas remplacer le solde par un message d'erreur.
    return {
      body: {
        balances: balances.data ?? [],
        origins: breakdown.error ? [] : (breakdown.data ?? []),
      },
    };
  },
));
