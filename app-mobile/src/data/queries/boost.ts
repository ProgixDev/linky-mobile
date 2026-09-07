// Boost — paid product visibility. List the seller's boosts + tiers, read one,
// and buy a boost (debits the wallet server-side). Follows the house TanStack
// pattern; the server owns the price, so create only sends { productId, days }.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';
import type { Boost, BoostTier, PaymentNextStep } from '../types';

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

/** 'card' = Stripe (profils étranger). 'lengopay-card' / 'soutramoney' / 'kulu'
 *  = rails Lengopay guinéens (2026-09-07) : mêmes moyens que le panier, comme
 *  le client l'a demandé — « Unifier les méthodes de paiement dans l'appli ».
 *  Volontairement identique à Exclude<PaymentMethod,'…'> en contenu : c'est le
 *  même sélecteur partagé qui alimente les deux. */
export type BoostPayMethod =
  | 'wallet' | 'orange-money' | 'mtn-money' | 'card'
  | 'kulu' | 'soutramoney' | 'lengopay-card';

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
  | { kind: 'card'; boostId: string; clientSecret: string; publishableKey: string }
  /** Soutra Money / carte Lengopay (2026-09-07) : le vendeur finit sur la page
   *  du rail. Rien n'est payé tant qu'il ne l'a pas fait. */
  | { kind: 'webview'; boostId: string; url: string }
  /** Kulu (2026-09-07) : le vendeur saisit un code reçu par SMS. */
  | { kind: 'otp'; boostId: string; payId: string };

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
        next_step?: PaymentNextStep;
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
      if (res.next_step?.kind === 'webview' && res.boost_id) {
        return { kind: 'webview', boostId: res.boost_id, url: res.next_step.url };
      }
      if (res.next_step?.kind === 'otp' && res.boost_id) {
        return { kind: 'otp', boostId: res.boost_id, payId: res.next_step.payId };
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
