'use client';

// Phase LIVREUR ONBOARDING — TanStack Query hooks for the courier application
// review queue.
//
// Endpoints (supabase/functions/{admin-list-livreur-applications,
// admin-decide-livreur-application}/index.ts):
//   - admin-list-livreur-applications : admin-only. status default 'pending',
//     newest-first, with the applicant's primary phone + email joined.
//   - admin-decide-livreur-application : admin-only. approve → status
//     'approved' + 'livreur' role granted (atomic in the RPC); reject →
//     'rejected' + reject_reason (required). Appends an admin_actions audit row.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';

export type LivreurApplicationStatus = 'pending' | 'approved' | 'rejected';
export type VehicleType = 'moto' | 'voiture' | 'velo' | 'a_pied';

export interface LivreurAnswers {
  zones?: string | string[];
  availability?: string;
  has_license_insurance?: boolean;
  accepts_qr_process?: boolean;
  accepts_linky_terms?: boolean;
}

export interface LivreurApplication {
  id: string;
  userId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  city: string;
  vehicleType: VehicleType;
  idPhotoUrl: string | null;
  answers: LivreurAnswers;
  status: LivreurApplicationStatus;
  rejectReason?: string;
  createdAt: string;
}

interface ListResponse {
  applications: LivreurApplication[];
  next_cursor: { created_at: string; id: string } | null;
}

interface DecideBody {
  application_id: string;
  decision: 'approve' | 'reject';
  reject_reason?: string;
}

// 30s poll posture, mirroring the KYC / withdrawals queues.
export function useLivreurApplications(status: LivreurApplicationStatus = 'pending') {
  return useQuery({
    queryKey: ['livreur-applications', status],
    queryFn: async () => {
      const r = await apiFetch<ListResponse>('admin-list-livreur-applications', { status });
      if (!r.ok || !r.data) {
        throw r.error ?? { code: 'UNKNOWN', message_fr: 'Erreur de chargement' };
      }
      return r.data.applications;
    },
    refetchInterval: 30_000,
  });
}

export function useDecideLivreurApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: DecideBody) => {
      const r = await apiFetch<{ application: LivreurApplication }>('admin-decide-livreur-application', body);
      if (!r.ok || !r.data) {
        throw r.error ?? { code: 'UNKNOWN', message_fr: 'Erreur décision' };
      }
      return r.data.application;
    },
    onSuccess: (app) => {
      // Invalidate every status bucket — the row moves from 'pending' to
      // 'approved'/'rejected'.
      qc.invalidateQueries({ queryKey: ['livreur-applications'] });
      toast.success(
        app.status === 'approved'
          ? 'Candidature acceptée. Le rôle livreur est accordé.'
          : 'Candidature refusée. Le candidat est informé via l’app.',
      );
    },
    onError: (err: unknown) => {
      const e = err as { code?: string; message_fr?: string };
      switch (e.code) {
        case 'FORBIDDEN_ADMIN':
          toast.error('Accès admin requis');
          return;
        case 'APPLICATION_NOT_FOUND':
          toast.error('Candidature introuvable');
          return;
        case 'APPLICATION_NOT_PENDING':
          toast.error('Cette candidature est déjà tranchée');
          return;
        case 'REASON_REQUIRED':
          toast.error('Un motif est requis pour refuser');
          return;
        default:
          toast.error(e.message_fr ?? 'Erreur décision');
      }
    },
  });
}
