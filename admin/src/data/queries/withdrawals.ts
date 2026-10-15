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

// ── VERSEMENT AUTOMATIQUE (Lengopay) ──────────────────────────────────────
//
// Remplace le virement a la main : l'argent part vers Orange Money ou MTN sans
// que personne n'ouvre son telephone. Voir
// supabase/functions/withdrawal-payout/index.ts.
//
// ⚠ Cette action ne marque PAS la demande payee. Elle LANCE le versement et
// rend un pay_id. C'est le rappel de Lengopay — verifie aupres d'eux, jamais
// cru sur parole — qui clora la demande. L'interface doit donc dire
// « lance », pas « paye », sinon l'administrateur croira que c'est fini.
interface PayoutWithdrawalResponse {
  ok: true;
  pay_id: string;
  status: string;
}

export function usePayoutWithdrawal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { request_id: string }) => {
      const r = await apiFetch<PayoutWithdrawalResponse>('withdrawal-payout', body);
      if (!r.ok || !r.data) {
        throw r.error ?? { code: 'UNKNOWN', message_fr: 'Erreur versement' };
      }
      return r.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['withdrawals'] });
      toast.success('Versement lancé. Le retrait se clôturera à la confirmation de Lengopay.');
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
        case 'REQUEST_NOT_PAYABLE':
          toast.error("Cette demande n'attend pas de virement");
          return;
        case 'PAYOUT_ALREADY_CLAIMED':
          // Le verrou a mordu. Ce n'est pas une panne : c'est la protection
          // contre le double paiement qui fait son travail.
          toast.error('Un versement est déjà parti pour cette demande');
          return;
        case 'DESTINATION_UNUSABLE':
          // Le motif exact vient du serveur (opérateur non reconnu, préfixe
          // qui ne correspond pas…) : il faut le montrer tel quel, c'est lui
          // qui dit à l'administrateur quoi faire.
          toast.error(e.message_fr ?? 'Destination inexploitable — virement à faire à la main');
          return;
        case 'INSUFFICIENT_FLOAT':
          toast.error('La caisse Lengopay ne couvre pas ce montant. Alimente-la puis réessaie.');
          return;
        case 'PAYOUT_FAILED':
          toast.error('Lengopay a refusé le versement. La demande reste à traiter.');
          return;
        default:
          toast.error(e.message_fr ?? 'Erreur versement');
      }
    },
  });
}
