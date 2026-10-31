// Le portefeuille du LIVREUR, pour l'accueil de Dépose (client 2026-10-31 :
// « add a wallet on the home page like Linky to able deliver men to withdraw
// their delivery money »).
//
// Il lit la caisse 'livreur' — et elle seule. Les frais de livraison y
// arrivent a chaque remise confirmee (pay_livreur_delivery_fee, migration
// 20261031_01). Les caisses Vendeur et Immo d'un livreur qui vend aussi sur
// Linky restent dans l'app Linky : on ne mele pas les deux.
//
// Body     : {}
// Reponse  : { balance_minor, entries: [...], withdrawals: [...] }
//   - balance_minor : le dernier balance_after, la meme lecture que
//     request_withdrawal — l'ecran ne propose jamais plus que ce que la base
//     acceptera ;
//   - entries : les 50 derniers mouvements, avec la reference de la commande
//     pour un gain de livraison ;
//   - withdrawals : les 20 derniers retraits de la caisse livreur, avec
//     `cancellable` (meme regle que list-my-withdrawals).
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

type Body = Record<string, never>;

function valid(b: unknown): b is Body {
  return typeof b === 'object' && b !== null;
}

Deno.serve(makePost<Body>('/v1/livreur/wallet', valid, async ({ sb, req }) => {
  const userId = await requireUser(req);

  const { data: wallet, error: eW } = await sb
    .from('wallets')
    .select('id')
    .eq('user_id', userId)
    .eq('kind', 'livreur')
    .eq('currency', 'GNF')
    .maybeSingle();
  if (eW) { console.error('[livreur-wallet] wallet:', eW); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }

  let balance = 0;
  let entries: Record<string, unknown>[] = [];
  if (wallet) {
    const { data: rows, error: eL } = await sb
      .from('ledger_entries')
      .select('id, direction, amount_minor, balance_after, ref_type, ref_id, created_at')
      .eq('wallet_id', wallet.id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(50);
    if (eL) { console.error('[livreur-wallet] ledger:', eL); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
    const list = rows ?? [];
    balance = list.length > 0 ? Number(list[0].balance_after) : 0;

    // La reference de commande (« LK-2026-10070 ») dit au livreur QUELLE course
    // lui a rapporte ce montant.
    const orderIds = list.filter((r) => r.ref_type === 'livreur_delivery_fee').map((r) => r.ref_id as string);
    const refs = new Map<string, string>();
    if (orderIds.length > 0) {
      const { data: orders, error: eO } = await sb.from('orders').select('id, reference').in('id', orderIds);
      if (eO) console.error('[livreur-wallet] orders (non bloquant):', eO);
      for (const o of orders ?? []) refs.set(o.id as string, o.reference as string);
    }
    entries = list.map((r) => ({
      id: r.id,
      direction: r.direction,
      amount_minor: Number(r.amount_minor),
      ref_type: r.ref_type,
      order_reference: r.ref_type === 'livreur_delivery_fee' ? (refs.get(r.ref_id as string) ?? null) : null,
      created_at: r.created_at,
    }));
  }

  const { data: wd, error: eWd } = await sb
    .from('withdrawal_requests')
    .select('id, amount_minor, status, destination, reason, created_at, decided_at, payout_claimed_at')
    .eq('user_id', userId)
    .eq('wallet_kind', 'livreur')
    .order('created_at', { ascending: false })
    .limit(20);
  if (eWd) { console.error('[livreur-wallet] withdrawals:', eWd); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
  const withdrawals = (wd ?? []).map(({ payout_claimed_at, ...w }) => ({
    ...w,
    amount_minor: Number(w.amount_minor),
    cancellable: w.status === 'approved' && payout_claimed_at == null,
  }));

  return { body: { balance_minor: balance, entries, withdrawals } };
}));
