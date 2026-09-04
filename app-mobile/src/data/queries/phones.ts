// Pre-prod: multi-phone-per-account CRUD. Adding a new phone goes through
// OTP verification (purpose='add_phone') so an unverified phone can never
// silently become a login identity — see supabase/functions/phone-add-* for
// the security rationale.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';

export interface UserPhone {
  id: string;
  e164: string;
  carrier: string | null;
  is_primary: boolean;
  verified: boolean;
  created_at: string;
}

export function useMyPhones() {
  return useQuery({
    queryKey: ['my-phones'],
    queryFn: async (): Promise<UserPhone[]> => {
      const { phones } = await apiPost<{ phones: UserPhone[] }>({
        path: '/list-my-phones',
        body: {},
      });
      return phones;
    },
  });
}

export function useRequestAddPhone() {
  return useMutation({
    mutationFn: async (input: { e164: string }): Promise<{ otp_id: string; dev_code?: string }> => {
      return apiPost({ path: '/phone-add-request', body: input });
    },
  });
}

export function useConfirmAddPhone() {
  const qc = useQueryClient();
  return useMutation({
    // replaces_phone_id : modification d'un numero. Le serveur pose le nouveau
    // AVANT de retirer l'ancien (jamais de mise a jour en place — un numero
    // est un moyen de connexion, cf. phone-add-confirm).
    mutationFn: async (
      input: { otp_id: string; code: string; replaces_phone_id?: string },
    ): Promise<{ phone: UserPhone; replaced_phone_id: string | null }> => {
      return apiPost({ path: '/phone-add-confirm', body: input });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-phones'] });
    },
  });
}

export function useRemovePhone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ phoneId }: { phoneId: string }): Promise<void> => {
      await apiPost<{ ok: true }>({ path: '/phone-remove', body: { phone_id: phoneId } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-phones'] });
    },
  });
}

export function useSetPrimaryPhone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ phoneId }: { phoneId: string }): Promise<void> => {
      await apiPost<{ ok: true }>({ path: '/phone-set-primary', body: { phone_id: phoneId } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-phones'] });
    },
  });
}
