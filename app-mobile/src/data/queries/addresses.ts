// Pre-prod: address book CRUD hooks. Mirrors phones.ts ; no OTP step (an
// address is not an auth surface). Server is the single source of truth for
// is_default (the set-default endpoint goes through the set_default_address
// RPC which atomically clears-then-sets so the partial-unique index can't
// trip under concurrent writes).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';

export interface UserAddress {
  id: string;
  label: string;
  city: string;
  district: string | null;
  details: string | null;
  /** Exact delivery point (picked on the map; falls back to the city centroid). */
  lat: number | null;
  lng: number | null;
  is_default: boolean;
  created_at: string;
}

export interface AddressInput {
  label: string;
  city: string;
  district?: string | null;
  details?: string | null;
  /** Exact delivery point picked on the map; overrides the city centroid default. */
  lat?: number | null;
  lng?: number | null;
  is_default?: boolean;
}

export function useMyAddresses() {
  return useQuery({
    queryKey: ['my-addresses'],
    queryFn: async (): Promise<UserAddress[]> => {
      const { addresses } = await apiPost<{ addresses: UserAddress[] }>({
        path: '/list-my-addresses',
        body: {},
      });
      return addresses;
    },
  });
}

export function useAddAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddressInput): Promise<{ address: UserAddress }> => {
      return apiPost({ path: '/address-add', body: input });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-addresses'] });
    },
  });
}

export function useUpdateAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: { address_id: string } & Omit<AddressInput, 'is_default'>,
    ): Promise<{ address: UserAddress }> => {
      return apiPost({ path: '/address-update', body: input });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-addresses'] });
    },
  });
}

export function useRemoveAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ addressId }: { addressId: string }): Promise<void> => {
      await apiPost<{ ok: true }>({ path: '/address-remove', body: { address_id: addressId } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-addresses'] });
    },
  });
}

export function useSetDefaultAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ addressId }: { addressId: string }): Promise<void> => {
      await apiPost<{ ok: true }>({ path: '/address-set-default', body: { address_id: addressId } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-addresses'] });
    },
  });
}
