'use client';

// Phase P.5 — TanStack Query hooks for the KYC review queue.
//
// Endpoints (see supabase/functions/{list-kyc-sessions,kyc-decide}/index.ts):
//   - list-kyc-sessions : admin-only. scope 'open' → pending + in_review
//                         oldest-first (work queue) ; scope 'recent' →
//                         terminal sessions of the last 7 days.
//   - kyc-decide        : admin-only manual override for open sessions.
//                         Routes through the same applyKycDecision path as
//                         the Didit webhook (users mirror, shops.verified
//                         flip, push notification) + admin_actions audit.
//
// `decision` is Didit's opaque payload — rendered defensively in the module.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';

export interface KycSessionUser {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  kyc_status: string;
}

export interface KycSessionRow {
  id: string;
  status: 'pending' | 'in_review' | 'approved' | 'declined' | 'expired';
  decision: Record<string, unknown> | null;
  decided_via: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  users: KycSessionUser | null;
}

interface ListKycSessionsResponse {
  sessions: KycSessionRow[];
}

interface KycDecideBody {
  session_id: string;
  outcome: 'approve' | 'decline';
  reason?: string;
}

interface KycDecideResponse {
  ok: true;
  status: 'approved' | 'declined';
}

// Same 30s poll posture as the disputes queue (V1.1: realtime channel).
export function useKycSessions(scope: 'open' | 'recent' = 'open') {
  return useQuery({
    queryKey: ['kyc-sessions', scope],
    queryFn: async () => {
      const r = await apiFetch<ListKycSessionsResponse>('list-kyc-sessions', { scope });
      if (!r.ok || !r.data) {
        throw r.error ?? { code: 'UNKNOWN', message_fr: 'Erreur de chargement' };
      }
      return r.data.sessions;
    },
    refetchInterval: 30_000,
  });
}

export function useKycDecide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: KycDecideBody) => {
      const r = await apiFetch<KycDecideResponse>('kyc-decide', body);
      if (!r.ok || !r.data) {
        throw r.error ?? { code: 'UNKNOWN', message_fr: 'Erreur décision' };
      }
      return r.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['kyc-sessions'] });
      toast.success(
        data.status === 'approved'
          ? 'KYC validé. Utilisateur notifié.'
          : 'KYC rejeté. Utilisateur notifié.',
      );
    },
    onError: (err: unknown) => {
      const e = err as { code?: string; message_fr?: string };
      switch (e.code) {
        case 'FORBIDDEN_ADMIN':
          toast.error('Accès admin requis');
          return;
        case 'KYC_SESSION_NOT_FOUND':
          toast.error('Session introuvable');
          return;
        case 'KYC_SESSION_CLOSED':
          toast.error('Cette session est déjà tranchée');
          return;
        default:
          toast.error(e.message_fr ?? 'Erreur décision');
      }
    },
  });
}
