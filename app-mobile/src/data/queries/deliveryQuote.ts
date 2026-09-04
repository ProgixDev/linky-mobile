// Devis de livraison — ce que le serveur prelevera reellement.
//
// Depuis 2026-09-03 le tarif depend de la distance vendeur -> acheteur (client :
// « 1 km = 2000 GNF »). Ni la grille (delivery_pricing, service_role seul) ni
// les coordonnees des boutiques ne sortent du serveur, donc l'application ne
// peut pas calculer ce montant : elle le demande. Sans ça, le recap afficherait
// un forfait et l'encaissement porterait un autre montant.
import { useQuery } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';
import type { DeliveryMode } from '../../lib/delivery';

export interface DeliveryQuoteShop {
  shop_id: string;
  fee_minor: number;
  /** false = forfait applique (geometrie pas fiable), true = prix a la distance. */
  priced_by_distance: boolean;
}

export interface DeliveryQuote {
  total_minor: number;
  shops: DeliveryQuoteShop[];
  priced_by_distance: boolean;
}

export function useDeliveryQuote({
  productIds,
  deliveryMode,
  addressId,
  enabled = true,
}: {
  productIds: string[];
  deliveryMode: DeliveryMode;
  /** Adresse par defaut de l'acheteur — le prix en depend directement, donc la
   *  cle de cache aussi. Sans elle, l'acheteur qui ajoute ou change son adresse
   *  (ce que l'ecran de paiement lui propose lui-meme) garderait le devis
   *  calcule pour l'ancienne, et paierait un montant different de l'affiche. */
  addressId?: string | null;
  enabled?: boolean;
}) {
  return useQuery({
    // Le devis depend du panier, du mode ET de la destination.
    queryKey: ['delivery-quote', deliveryMode, addressId ?? 'none', [...productIds].sort().join(',')],
    enabled: enabled && productIds.length > 0,
    // Un devis perime afficherait un montant que le serveur ne pratiquera plus.
    staleTime: 30_000,
    queryFn: async (): Promise<DeliveryQuote> =>
      apiPost<DeliveryQuote>({
        path: '/delivery-quote',
        body: { product_ids: productIds, delivery_mode: deliveryMode },
      }),
  });
}
