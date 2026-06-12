// Wallet queries wired to the real edge functions (Block D). Maps the rail-agnostic
// double-entry ledger (per-currency, integer minor units) onto the GNF-centric Wallet
// shape the existing screens consume. Only GNF is surfaced in the UI for V1.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';
import type { Wallet, WalletMovement } from '../types';

interface BalanceRow { wallet_id: string; currency: string; balance_minor: number }
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

// Keys = actual ledger ref_type values (see migrations: confirm_topup,
// place_order, confirm_order_receipt, resolve_dispute, process_withdrawal).
const REF_LABEL: Record<string, string> = {
  topup: 'Recharge',
  withdrawal_payout: 'Retrait',
  order_escrow: 'Paiement commande',
  order_release: 'Vente encaissée',
  order_platform_fee: 'Frais de service',
  order_refund: 'Remboursement',
  order_fee_refund: 'Remboursement des frais',
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
        apiPost<{ balances: BalanceRow[] }>({ path: '/wallet-balance', body: {} }),
        apiPost<{ entries: HistoryEntry[]; next_cursor: unknown }>({ path: '/wallet-history', body: { limit: 50 } }),
      ]);
      const gnf = balance.balances.find((b) => b.currency === 'GNF');
      const balanceGnf = Number(gnf?.balance_minor ?? 0);
      const movements = (history.entries ?? []).filter((e) => e.currency === 'GNF').map(toMovement);
      return { balanceGnf, pendingGnf: 0, movements };
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
