// Wallet queries wired to the real edge functions (Block D). Maps the rail-agnostic
// double-entry ledger (per-currency, integer minor units) onto the GNF-centric Wallet
// shape the existing screens consume. Only GNF is surfaced in the UI for V1.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';
import type { Wallet, WalletKind, WalletMovement, WalletOrigin } from '../types';

interface BalanceRow { wallet_id: string; kind?: string; currency: string; balance_minor: number }
interface OriginRow { kind?: string; currency: string; origin: string; net_minor: number }
interface HistoryEntry {
  id: string;
  wallet_id: string;
  currency: string;
  direction: 'debit' | 'credit';
  amount_minor: number;
  balance_after: number;
  ref_type: string;
  ref_id: string;
  created_at: string;
}

// Les cles sont les ref_type REELS du grand livre, releves sur les appels a
// post_transfer dans les migrations (11 valeurs distinctes).
//
// DEUX CLES ETAIENT FAUSSES et deux familles manquaient : 'topup' et
// 'withdrawal_payout' n'existent pas — le grand livre ecrit 'credit' et
// 'debit' — et rien ne couvrait l'immobilier ni les mises en avant. Ces
// mouvements s'affichaient donc dans l'historique avec leur nom technique brut
// (« booking_release »), ce que personne ne peut lire.
const REF_LABEL: Record<string, string> = {
  credit: 'Recharge',
  debit: 'Retrait',
  order_escrow: 'Paiement commande',
  order_release: 'Vente encaissée',
  order_platform_fee: 'Frais de service',
  order_refund: 'Remboursement',
  order_fee_refund: 'Remboursement des frais',
  booking_release: 'Loyer encaissé',
  booking_refund: 'Remboursement réservation',
  booking_platform_fee: 'Frais de service',
  boost_purchase: 'Mise en avant',
};

function toMovement(e: HistoryEntry): WalletMovement {
  const incoming = e.direction === 'credit';
  return {
    id: e.id,
    direction: incoming ? 'in' : 'out',
    label: REF_LABEL[e.ref_type] ?? e.ref_type,
    amountGnf: incoming ? e.amount_minor : -e.amount_minor, // signed: +in / -out, matches the UI
    date: e.created_at,
    status: incoming ? 'received' : 'completed',
  };
}

export function useWallet() {
  return useQuery({
    queryKey: ['wallet'],
    queryFn: async (): Promise<Wallet> => {
      const [balance, history] = await Promise.all([
        apiPost<{ balances: BalanceRow[]; origins?: OriginRow[] }>({ path: '/wallet-balance', body: {} }),
        apiPost<{ entries: HistoryEntry[]; next_cursor: unknown }>({ path: '/wallet-history', body: { limit: 50 } }),
      ]);
      // DEUX CAISSES DEPUIS LE 2026-09-24. Le serveur rend une ligne PAR
      // caisse ; l'ancien `.find(currency === 'GNF')` aurait pris la premiere
      // et ignore l'autre en silence. `kind` est optionnel : un binaire qui
      // tourne encore sur l'ancienne fonction n'en recoit pas, et tout tombe
      // alors dans la caisse vendeur — c'est-a-dire le comportement d'avant.
      const gnfRows = balance.balances.filter((b) => b.currency === 'GNF');
      const sumKind = (k: string) =>
        gnfRows
          .filter((b) => (b.kind ?? 'seller') === k)
          .reduce((n, b) => n + Number(b.balance_minor ?? 0), 0);
      const balanceGnf = sumKind('seller');
      const immoGnf = sumKind('immo');
      const movements = (history.entries ?? []).filter((e) => e.currency === 'GNF').map(toMovement);
      // `origins` est optionnel : un binaire qui tourne encore sur l'ancienne
      // fonction serveur ne le recevra pas, et l'ecran doit rester correct —
      // il affiche alors le solde sans sa ventilation.
      const originsGnf: Wallet['originsGnf'] = {};
      const originsByKind: Wallet['originsByKind'] = {};
      for (const row of balance.origins ?? []) {
        if (row.currency !== 'GNF') continue;
        const o = row.origin as WalletOrigin;
        const k = (row.kind ?? 'seller') as WalletKind;
        // Le serveur groupe desormais par caisse : une meme origine peut donc
        // arriver deux fois. On additionne au lieu d'ecraser.
        originsGnf[o] = (originsGnf[o] ?? 0) + Number(row.net_minor);
        const bucket = (originsByKind[k] ??= {});
        bucket[o] = (bucket[o] ?? 0) + Number(row.net_minor);
      }
      return {
        balanceGnf,
        immoGnf,
        totalGnf: balanceGnf + immoGnf,
        pendingGnf: 0,
        movements,
        originsGnf,
        originsByKind,
      };
    },
  });
}

// Phase X.7 — useRechargeWallet removed. The recharger screen now reads
// "Bientôt disponible" (no consumer left) ; the /wallet-topup-intent edge
// function and its V1.1 demo seeding pattern (SQL insert + confirm_topup)
// stay live, so V1.1 can re-introduce the hook when Mobile Money goes wet.

export interface WithdrawalRequestItem {
  id: string;
  currency: string;
  amount_minor: number;
  status: 'pending' | 'approved' | 'paid' | 'rejected' | 'cancelled';
  destination: string | null;
  reason: string | null;
  created_at: string;
  decided_at: string | null;
}

// The seller's own withdrawal requests — feeds the « Retraits » tab.
export function useMyWithdrawals() {
  return useQuery({
    queryKey: ['my-withdrawals'],
    queryFn: async (): Promise<WithdrawalRequestItem[]> => {
      const { withdrawals } = await apiPost<{ withdrawals: WithdrawalRequestItem[] }>({
        path: '/list-my-withdrawals',
        body: {},
      });
      return withdrawals;
    },
  });
}

interface WithdrawArgs {
  amountGnf: number;
  destination?: string;
}

// Records a PENDING withdrawal request (manual payout in V1). Server rejects if balance < amount.
export function useWithdrawWallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ amountGnf, destination }: WithdrawArgs) =>
      apiPost<{ withdrawal: unknown }>({
        path: '/wallet-withdraw-request',
        body: { currency: 'GNF', amount_minor: amountGnf, destination },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet'] });
      qc.invalidateQueries({ queryKey: ['my-withdrawals'] });
    },
  });
}

export interface TopupCardResult {
  topup_id: string;
  client_secret: string;
  publishable_key: string;
}

// Card-funded wallet top-up. Returns a Stripe PaymentIntent client_secret for
// the PaymentSheet ; the wallet is credited by the stripe-webhook -> confirm_topup
// path a couple seconds after the charge succeeds (invalidate ['wallet'] then).
export function useTopupCard() {
  return useMutation({
    mutationFn: async (amountGnf: number): Promise<TopupCardResult> =>
      apiPost<TopupCardResult>({ path: '/wallet-topup-card', body: { amount_minor: amountGnf } }),
  });
}
