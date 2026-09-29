'use client';

// Phase S — TanStack Query hooks for the withdrawals queue.
//
// Endpoints (see supabase/functions/{list-withdrawals,process-withdrawal}/index.ts):
//   - list-withdrawals   : admin-only. scope 'pending' → pending oldest-first
//                          with the seller's CURRENT balance attached
//                          (balance_minor) — funds are NOT held at request
//                          time, so the console flags requests the balance no
//                          longer covers ; scope 'recent' → paid/rejected of
//                          the last 7 days.
//   - process-withdrawal : admin-only terminal decision. 'paid' debits the
//                          seller wallet (one-sided external exit) + push ;
//                          'rejected' requires a reason, no money movement.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';

export interface WithdrawalUser {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface WithdrawalRow {
  id: string;
  user_id: string;
  currency: 'GNF' | 'EUR';
  amount_minor: number;
  status: 'pending' | 'approved' | 'paid' | 'rejected' | 'cancelled';
  destination: string | null;
  reason: string | null;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
  /** Present on scope 'pending' only — seller's current wallet balance. */
  balance_minor?: number;
  users: WithdrawalUser | null;
}

interface ListWithdrawalsResponse {
  withdrawals: WithdrawalRow[];
}

interface ProcessWithdrawalBody {
  request_id: string;
  outcome: 'paid' | 'rejected';
  reason?: string;
}

interface ProcessWithdrawalResponse {
  ok: true;
  withdrawal: WithdrawalRow;
}

// Same 30s poll posture as the disputes + KYC queues (V1.1: realtime channel).
export function useWithdrawals(scope: 'pending' | 'recent' = 'pending') {
  return useQuery({
    queryKey: ['withdrawals', scope],
    queryFn: async () => {
      const r = await apiFetch<ListWithdrawalsResponse>('list-withdrawals', { scope });
      if (!r.ok || !r.data) {
        throw r.error ?? { code: 'UNKNOWN', message_fr: 'Erreur de chargement' };
      }
      return r.data.withdrawals;
    },
    refetchInterval: 30_000,
  });
}

/**
 * Le solde que LengoPay detient pour Linky.
 *
 * C'est l'argent depuis lequel les retraits sont REELLEMENT payes. Jusqu'ici la
 * console ne montrait que le solde du VENDEUR — ce qu'on lui doit — sans jamais
 * dire s'il y avait de quoi l'honorer.
 *
 * `available: false` veut dire « je n'ai pas pu savoir », et l'ecran doit le
 * dire ainsi : zero et l'ignorance se ressemblent a l'oeil et ne veulent pas du
 * tout dire la meme chose sur un ecran d'argent.
 *
 * Rafraichi moins souvent que la file : une tresorerie ne bouge pas toutes les
 * trente secondes, et chaque appel sort chez un tiers.
 */
export interface LengopayBalance {
  available: boolean;
  /** « Pay In » : l'argent encaissé que LengoPay détient pour Linky. */
  amountGnf: number | null;
  /** « Pay Out » : leur caisse de DÉCAISSEMENT, distincte de la précédente.
   *  Absente si leur réponse ne la porte pas. Ne jamais additionner les deux. */
  payoutGnf?: number | null;
  currency: string | null;
  reason?: string;
}

export function useLengopayBalance() {
  return useQuery({
    queryKey: ['lengopay-balance'],
    queryFn: async () => {
      const r = await apiFetch<{ balance: LengopayBalance }>('admin-lengopay-balance', {});
      if (!r.ok || !r.data) {
        throw r.error ?? { code: 'UNKNOWN', message_fr: 'Erreur de chargement' };
      }
      return r.data.balance;
    },
    refetchInterval: 120_000,
    retry: 1,
  });
}

export function useProcessWithdrawal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ProcessWithdrawalBody) => {
      const r = await apiFetch<ProcessWithdrawalResponse>('process-withdrawal', body);
      if (!r.ok || !r.data) {
        throw r.error ?? { code: 'UNKNOWN', message_fr: 'Erreur décision' };
      }
      return r.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['withdrawals'] });
      toast.success(
        data.withdrawal.status === 'paid'
          ? 'Retrait marqué payé. Vendeur notifié.'
          : 'Retrait rejeté. Vendeur notifié.',
      );
    },
    onError: (err: unknown) => {
      const e = err as { code?: string; message_fr?: string };
      switch (e.code) {
        case 'FORBIDDEN_ADMIN':
          toast.error('Accès admin requis');
          return;
        case 'REQUEST_NOT_FOUND':
          toast.error('Demande introuvable');
          return;
        case 'REQUEST_CLOSED':
          toast.error('Cette demande est déjà traitée');
          return;
        case 'INSUFFICIENT_FUNDS':
          toast.error('Le solde du vendeur ne couvre plus ce retrait');
          return;
        case 'REASON_REQUIRED':
          toast.error('Un motif est requis pour rejeter');
          return;
        default:
          toast.error(e.message_fr ?? 'Erreur décision');
      }
    },
  });
}
