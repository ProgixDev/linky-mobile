// Phase S — the seller's own withdrawal requests (newest first, last 20).
// Feeds the « Retraits » tab on the wallet screen : status chips
// en attente / payé / refusé / annulé. Authed, scoped to the JWT user.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

type Body = Record<string, never>;

function valid(b: unknown): b is Body {
  return typeof b === 'object' && b !== null;
}

Deno.serve(makePost<Body>('/v1/wallet/withdrawals', valid, async ({ sb, req }) => {
  const userId = await requireUser(req);

  const { data, error } = await sb
    .from('withdrawal_requests')
    .select('id, currency, amount_minor, status, destination, reason, created_at, decided_at, payout_claimed_at')
    .eq('user_id', userId)
    // Les retraits de la caisse LIVREUR se suivent dans Dépose (livreur-wallet),
    // pas dans le portefeuille Linky (migration 20261031_01).
    .in('wallet_kind', ['seller', 'immo'])
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) {
    console.error('[list-my-withdrawals] select error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  // `cancellable` : l'app n'affiche « Annuler » que la ou la base l'accepterait
  // (cancel_withdrawal). Ce n'est qu'un confort d'affichage — la vraie garde
  // est le verrou en base, qui tranche si l'admin reserve entre-temps. On ne
  // renvoie pas `payout_claimed_at` lui-meme : le vendeur n'en a pas l'usage.
  const withdrawals = (data ?? []).map(({ payout_claimed_at, ...w }) => ({
    ...w,
    cancellable: w.status === 'approved' && payout_claimed_at == null,
  }));

  return { body: { withdrawals } };
}));
