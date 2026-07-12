'use client';

// Admin users table hooks. Read + suspend/reactivate (moderation, 2026-07-11).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';

export type UserStatus = 'active' | 'suspended' | 'deleted';

export interface AdminUser {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  kyc_status: 'none' | 'pending' | 'in_review' | 'approved' | 'declined';
  is_admin: boolean;
  status: UserStatus;
  created_at: string;
}

export function useAdminUsers(search?: string) {
  return useQuery({
    queryKey: ['admin-users', search ?? ''],
    queryFn: async () => {
      const r = await apiFetch<{ users: AdminUser[] }>('list-users-admin', search ? { search } : {});
      if (!r.ok || !r.data) {
        throw r.error ?? { code: 'UNKNOWN', message_fr: 'Erreur de chargement' };
      }
      return r.data.users;
    },
  });
}

export function useSetUserStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { user_id: string; action: 'suspend' | 'reactivate'; reason?: string }) => {
      const r = await apiFetch<{ ok: true; status: UserStatus }>('admin-set-user-status', input);
      if (!r.ok || !r.data) throw r.error ?? { code: 'UNKNOWN', message_fr: 'Erreur' };
      return r.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success(data.status === 'suspended' ? 'Utilisateur suspendu.' : 'Utilisateur réactivé.');
    },
    onError: (err: unknown) => {
      const e = err as { code?: string; message_fr?: string };
      switch (e.code) {
        case 'FORBIDDEN': toast.error('Action non autorisée sur ce compte.'); return;
        case 'SELF_ACTION': toast.error('Tu ne peux pas te suspendre toi-même.'); return;
        case 'NO_CHANGE': toast.error('Statut déjà appliqué.'); return;
        default: toast.error(e.message_fr ?? 'Erreur.');
      }
    },
  });
}
