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

export type BoostPayMethod = 'wallet' | 'orange-money' | 'mtn-money' | 'card';

/** Portefeuille : le boost est actif immédiatement (débit atomique côté serveur).
 *  Mobile money : rien n'est actif encore — depuis Lengopay v2 (2026-09-05) la
 *  demande part directement chez l'opérateur (plus de page hébergée), le
 *  vendeur confirme sur son téléphone et c'est le cron qui activera. Les deux
 *  issues restent de formes différentes, pour que l'écran ne puisse pas
 *  confondre « payé » et « à payer ». */
export type CreateBoostResult =
  | { kind: 'active'; boost: Boost }
  | { kind: 'pending'; boostId: string }
  /** Carte bancaire (2026-09-07) : rien n'est payé tant que la feuille Stripe
   *  n'a pas abouti. Le boost reste 'pending_payment' et c'est le webhook qui
   *  l'activera — même prudence que la réservation. */
  | { kind: 'card'; boostId: string; clientSecret: string; publishableKey: string };

export function useCreateBoost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      productId, propertyId, days, method = 'wallet', payerPhone,
    }: CreateBoostInput): Promise<CreateBoostResult> => {
      const target = propertyId ? { property_id: propertyId } : { product_id: productId };
      const res = await apiPost<{
        boost?: Boost;
        boost_id?: string;
        payment?: { client_secret: string; publishable_key: string };
      }>({
        path: '/create-boost',
        body: { ...target, days, method, ...(payerPhone ? { payer_phone: payerPhone } : {}) },
      });
      if (res.payment && res.boost_id) {
        return {
          kind: 'card',
          boostId: res.boost_id,
          clientSecret: res.payment.client_secret,
          publishableKey: res.payment.publishable_key,
        };
      }
      if (!res.boost && res.boost_id) {
        return { kind: 'pending', boostId: res.boost_id };
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
