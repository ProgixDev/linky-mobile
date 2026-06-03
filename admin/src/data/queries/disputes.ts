'use client';

// Phase K.5 — TanStack Query hooks for the disputes Kanban + detail drawer.
//
// Endpoints (see supabase/functions/{list,get,resolve}-dispute/index.ts):
//   - list-disputes  : admin-only, returns orders where status='disputed'
//                      ordered updated_at ASC. Cursor pagination — V1 we just
//                      pull the first page (limit defaults to 50 server-side).
//   - get-dispute    : admin-only, returns one order + its full admin_actions
//                      history newest-first. Callable on any order (not just
//                      disputed) — drawer uses it to inspect resolved orders.
//   - resolve-dispute: admin-only, body { order_id, outcome, reason?, note? }.
//                      Server flips status to 'refunded'|'released' + appends
//                      a dispute_resolved event + writes admin_actions row.
//
// Wire shapes mirror mapOrder/mapAdminAction in functions/_shared/catalog.ts;
// kept inline here to avoid pulling Deno imports into the Next build.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';

export interface ParticipantBrief {
  id: string;
  displayName?: string;
  email?: string;
}

// Phase K widened the events array shape: legacy { at, label } plus new
// dispute fields (kind, outcome, admin_id, reason, note) live side-by-side.
// We keep the type open with Record<string, unknown> so the renderer can
// narrow per-field with typeof guards (see DisputeDetailDrawer).
export type DisputeEvent = { at: string; label?: string } & Record<string, unknown>;

export interface DisputeOrder {
  id: string;
  reference: string;
  buyerId: string;
  sellerId: string;
  shopId: string;
  productId: string;
  productSnapshot: { title: string; photo: string; priceGnf: number };
  quantity: number;
  amountGnf: number;
  feesGnf: number;
  totalGnf: number;
  paymentMethod: string;
  currency: 'GNF' | 'EUR';
  status: string;
  events: DisputeEvent[];
  createdAt: string;
  releaseAt?: string;
}

export interface DisputeListItem {
  order: DisputeOrder;
  buyer: ParticipantBrief;
  seller: ParticipantBrief;
}

export interface AdminAction {
  id: string;
  adminId: string;
  targetType: string;
  targetId: string;
  action: string;
  reason?: string;
  metadata: Record<string, unknown>;
  beforeSnapshot?: Record<string, unknown>;
  afterSnapshot?: Record<string, unknown>;
  createdAt: string;
}

interface DisputeListCursor { updated_at: string; id: string }
interface ListDisputesResponse {
  disputes: DisputeListItem[];
  next_cursor: DisputeListCursor | null;
}

interface GetDisputeResponse {
  order: DisputeOrder;
  admin_actions: AdminAction[];
}

interface ResolveDisputeBody {
  order_id: string;
  outcome: 'refund' | 'release';
  reason?: string;
  note?: string;
}

interface ResolveDisputeResponse {
  ok: true;
  order: DisputeOrder;
}

// 30s poll catches new disputes without realtime. V1.1 will swap this for a
// Supabase realtime channel on the orders table so we can drop the polling.
export function useDisputes() {
  return useQuery({
    queryKey: ['disputes', 'all'],
    queryFn: async () => {
      const r = await apiFetch<ListDisputesResponse>('list-disputes', {});
      if (!r.ok || !r.data) {
        throw r.error ?? { code: 'UNKNOWN', message_fr: 'Erreur de chargement' };
      }
      return r.data;
    },
    refetchInterval: 30_000,
  });
}

export function useDispute(orderId?: string) {
  return useQuery({
    queryKey: ['dispute', orderId],
    queryFn: async () => {
      const r = await apiFetch<GetDisputeResponse>('get-dispute', { order_id: orderId });
      if (!r.ok || !r.data) {
        throw r.error ?? { code: 'UNKNOWN', message_fr: 'Erreur de chargement' };
      }
      return r.data;
    },
    enabled: orderId !== undefined,
  });
}

export function useResolveDispute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ResolveDisputeBody) => {
      const r = await apiFetch<ResolveDisputeResponse>('resolve-dispute', body);
      if (!r.ok || !r.data) {
        throw r.error ?? { code: 'UNKNOWN', message_fr: 'Erreur résolution' };
      }
      return r.data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['disputes'] });
      qc.invalidateQueries({ queryKey: ['dispute', variables.order_id] });
      toast.success('Litige résolu');
    },
    onError: (err: unknown) => {
      const e = err as { code?: string; message_fr?: string };
      switch (e.code) {
        case 'FORBIDDEN_ADMIN':
          toast.error('Accès admin requis');
          return;
        case 'INVALID_STATUS':
          toast.error("Cette commande n'est plus en litige");
          return;
        case 'INVALID_OUTCOME':
          toast.error('Verdict invalide');
          return;
        case 'ORDER_NOT_FOUND':
          toast.error('Commande introuvable');
          return;
        default:
          toast.error(e.message_fr ?? 'Erreur résolution');
      }
    },
  });
}
