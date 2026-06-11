'use client';

// Final sprint §2 — admin users table hooks (READ-ONLY in V1).

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface AdminUser {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  kyc_status: 'none' | 'pending' | 'in_review' | 'approved' | 'declined';
  is_admin: boolean;
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
