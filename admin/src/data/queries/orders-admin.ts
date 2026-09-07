'use client';

// Final sprint §2 — admin orders table hooks (READ-ONLY ; the disputes Kanban
// keeps its own dedicated endpoints).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';

export type AdminOrderStatus =
  | 'placed' | 'paid' | 'preparing' | 'delivered'
  | 'released' | 'disputed' | 'cancelled' | 'refunded';

export interface AdminOrder {
  id: string;
  reference: string;
  total_minor: number;
  status: AdminOrderStatus;
  created_at: string;
  product_snapshot: { title?: string } | null;
  buyer: { id: string; display_name: string | null } | null;
  seller: { id: string; display_name: string | null } | null;
}

export function useAdminOrders(status?: AdminOrderStatus) {
  return useQuery({
    queryKey: ['admin-orders', status ?? 'all'],
    queryFn: async () => {
      const r = await apiFetch<{ orders: AdminOrder[] }>('list-orders-admin', status ? { status } : {});
      if (!r.ok || !r.data) {
        throw r.error ?? { code: 'UNKNOWN', message_fr: 'Erreur de chargement' };
      }
      return r.data.orders;
    },
    refetchInterval: 30_000,
  });
}

/** Statuts depuis lesquels une commande bloquée peut être débloquée à la main.
 *  Doit rester d'accord avec admin_force_resolve_order côté serveur : proposer
 *  le bouton ailleurs donnerait un INVALID_STATUS que l'admin ne peut pas
 *  corriger. 'disputed' en est volontairement absent — ces commandes passent
 *  par le Kanban litiges, qui porte le seuil des deux admins au-delà de 5 M. */
export const FORCE_RESOLVABLE: AdminOrderStatus[] = ['paid', 'preparing', 'delivered'];

export function canForceResolve(status: AdminOrderStatus): boolean {
  return FORCE_RESOLVABLE.includes(status);
}

export interface ForceResolveBody {
  order_id: string;
  outcome: 'refund' | 'release';
  /** Obligatoire, contrairement au litige : ce geste n'a aucune trace
   *  préalable. Sans motif, personne ne saura dans six mois pourquoi cet
   *  argent a bougé. */
  reason: string;
}

/**
 * Débloque une commande dont l'acheteur ne répond plus.
 *
 * C'EST LE SEUL LEVIER qui existe pour ces commandes-là : resolve-dispute
 * exige le statut 'disputed', et rien ne permet d'y mettre une commande à la
 * place de l'acheteur. Sans ce bouton, l'argent restait au séquestre
 * indéfiniment — sans recours pour l'acheteur, le vendeur, ni l'admin.
 *
 * C'est aussi le recours des cas que le balayage automatique écarte
 * volontairement : montant au-dessus du plafond, livraison déjà engagée,
 * solde de séquestre incohérent, acheteur déjà remboursé plusieurs fois.
 */
export function useForceResolveOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ForceResolveBody) => {
      const r = await apiFetch<{ ok: boolean }>('admin-force-resolve-order', body);
      if (!r.ok || !r.data) {
        throw r.error ?? { code: 'UNKNOWN', message_fr: 'Erreur déblocage' };
      }
      return r.data;
    },
    onSuccess: (_d, variables) => {
      qc.invalidateQueries({ queryKey: ['admin-orders'] });
      qc.invalidateQueries({ queryKey: ['disputes'] });
      toast.success(
        variables.outcome === 'refund' ? 'Acheteur remboursé' : 'Fonds libérés au vendeur',
      );
    },
    onError: (err: unknown) => {
      const e = err as { code?: string; message_fr?: string };
      switch (e.code) {
        case 'FORBIDDEN_ADMIN':
          toast.error('Accès admin requis');
          return;
        case 'USE_RESOLVE_DISPUTE':
          toast.error('Commande en litige — passe par le Kanban litiges');
          return;
        case 'INVALID_STATUS':
          toast.error("Cette commande n'est plus déblocable");
          return;
        case 'FORBIDDEN_SELF_DEAL':
          toast.error('Tu es partie à cette commande');
          return;
        case 'ESCROW_MISMATCH':
          // Volontairement bavard : c'est le seul cas où l'admin doit aller
          // regarder le grand livre avant de réessayer quoi que ce soit.
          toast.error(
            e.message_fr ?? 'Solde du séquestre incohérent — vérification comptable requise',
            { duration: 10_000 },
          );
          return;
        case 'ESCROW_EMPTY':
          toast.error('Le séquestre ne détient plus les fonds de cette commande');
          return;
        case 'REASON_REQUIRED':
          toast.error('Un motif est obligatoire');
          return;
        default:
          toast.error(e.message_fr ?? 'Erreur déblocage');
      }
    },
  });
}
