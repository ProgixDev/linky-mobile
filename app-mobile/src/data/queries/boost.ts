// Boost — paid product visibility. List the seller's boosts + tiers, read one,
// and buy a boost (debits the wallet server-side). Follows the house TanStack
// pattern; the server owns the price, so create only sends { productId, days }.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';
import type { Boost, BoostTier } from '../types';

export function useBoosts() {
  return useQuery({
    queryKey: ['boosts'],
    queryFn: async (): Promise<{ boosts: Boost[]; tiers: BoostTier[] }> =>
      apiPost<{ boosts: Boost[]; tiers: BoostTier[] }>({ path: '/list-boosts', body: {} }),
  });
}

export function useBoost(id: string | undefined) {
  return useQuery({
    queryKey: ['boost', id],
    enabled: !!id,
    queryFn: async (): Promise<Boost> => {
      const { boost } = await apiPost<{ boost: Boost }>({ path: '/get-boost', body: { id } });
      return boost;
    },
  });
}

// Exactly one of productId / propertyId.
export interface CreateBoostInput {
  productId?: string;
  propertyId?: string;
  days: number;
  /** Défaut portefeuille — c'était le seul rail avant le 2026-08-12. */
  method?: BoostPayMethod;
  payerPhone?: string;
}

export type BoostPayMethod = 'wallet' | 'orange-money' | 'mtn-money';

/** Portefeuille : le boost est actif immédiatement (débit atomique côté serveur).
 *  Mobile money : rien n'est actif encore — l'argent doit d'abord transiter par
 *  la page Lengopay, et c'est le cron qui activera. Les deux issues sont donc
 *  volontairement de formes différentes, pour que l'écran ne puisse pas
 *  confondre « payé » et « à payer ». */
export type CreateBoostResult =
  | { kind: 'active'; boost: Boost }
  | { kind: 'redirect'; boostId: string; paymentUrl: string };

export function useCreateBoost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      productId, propertyId, days, method = 'wallet', payerPhone,
    }: CreateBoostInput): Promise<CreateBoostResult> => {
      const target = propertyId ? { property_id: propertyId } : { product_id: productId };
      const res = await apiPost<{ boost?: Boost; boost_id?: string; payment_url?: string }>({
        path: '/create-boost',
        body: { ...target, days, method, ...(payerPhone ? { payer_phone: payerPhone } : {}) },
      });
      if (res.payment_url && res.boost_id) {
        return { kind: 'redirect', boostId: res.boost_id, paymentUrl: res.payment_url };
      }
      if (!res.boost) throw new Error('Réponse inattendue du serveur');
      return { kind: 'active', boost: res.boost };
    },
    onSuccess: (_res, { productId, propertyId }) => {
      qc.invalidateQueries({ queryKey: ['boosts'] });
      qc.invalidateQueries({ queryKey: ['wallet'] }); // balance just dropped
      if (propertyId) {
        qc.invalidateQueries({ queryKey: ['my-properties'] });
        qc.invalidateQueries({ queryKey: ['properties'] }); // now surfaces boosted
        qc.invalidateQueries({ queryKey: ['property', propertyId] });
      } else {
        qc.invalidateQueries({ queryKey: ['products'] });
        qc.invalidateQueries({ queryKey: ['product', productId] });
      }
    },
  });
}
