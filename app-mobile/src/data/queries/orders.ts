// Wired to live edge functions: place-order / get-order / list-my-orders /
// confirm-receipt / dispute-order. All authed — list/get use the JWT to scope
// to the caller (buyer; participant for get). H2 escrow lifecycle is live:
// place_order debits the buyer's wallet into escrow, confirm-receipt splits
// the escrow (amount → seller, fees → platform), dispute-order parks the
// order at status='disputed' pending admin resolution (Phase K).
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';
import { useCart } from '../../stores/cart';
import type { Order, OrderStatus, PaymentIntent, PaymentMethod } from '../types';

interface Cursor { created_at: string; id: string }

export interface MyOrdersFilters {
  status?: OrderStatus;
}

export function useMyOrders(filters: MyOrdersFilters = {}) {
  return useQuery({
    queryKey: ['my-orders', filters],
    queryFn: async (): Promise<Order[]> => {
      const { orders } = await apiPost<{ orders: Order[]; next_cursor: Cursor | null }>({
        path: '/list-my-orders',
        body: { status: filters.status },
      });
      return orders;
    },
  });
}

export function useMyOrdersInfinite(filters: MyOrdersFilters = {}) {
  const query = useInfiniteQuery({
    queryKey: ['my-orders-infinite', filters],
    initialPageParam: undefined as Cursor | undefined,
    queryFn: async ({ pageParam }: { pageParam: Cursor | undefined }) =>
      apiPost<{ orders: Order[]; next_cursor: Cursor | null }>({
        path: '/list-my-orders',
        body: { status: filters.status, cursor: pageParam },
      }),
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });
  const orders = query.data?.pages.flatMap((p) => p.orders) ?? [];
  return { ...query, orders };
}

export const useOrders = useMyOrders;

interface OrderEnvelope { order: Order; intent: PaymentIntent | null }

// /get-order now returns BOTH the order and its latest payment_intent (null
// for wallet orders). useOrder uses TanStack `select` to project just the
// order so the existing 4 callers (dispute, success, order detail,
// confirm-receipt) stay backward-compat. useOrderWithIntent shares the same
// queryKey + cache, so the confirmation screen and other screens reading the
// same orderId issue ONE HTTP call per polling cycle (not two).
async function fetchOrderEnvelope(id: string | undefined): Promise<OrderEnvelope> {
  return apiPost<OrderEnvelope>({ path: '/get-order', body: { id } });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: ['order', id],
    enabled: !!id,
    queryFn: () => fetchOrderEnvelope(id),
    select: (env) => env.order,
  });
}

/** Confirmation-screen hook. Same query+cache as useOrder; returns both pieces. */
export function useOrderWithIntent(id: string | undefined) {
  return useQuery({
    queryKey: ['order', id],
    enabled: !!id,
    queryFn: () => fetchOrderEnvelope(id),
    refetchOnWindowFocus: true,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
}

export interface PlaceOrderInput {
  productId: string;
  quantity: number;
  paymentMethod: PaymentMethod;
  /** Optional Q6 override; omit to use the user's primary phone from /phones. */
  payerPhone?: string;
}

export interface PlaceOrderResult {
  order: Order;
  intent?: PaymentIntent;  // present for rail methods, absent for wallet
}

export function usePlaceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, quantity, paymentMethod, payerPhone }: PlaceOrderInput): Promise<PlaceOrderResult> => {
      return apiPost<PlaceOrderResult>({
        path: '/place-order',
        body: {
          product_id: productId,
          quantity,
          payment_method: paymentMethod,
          ...(payerPhone ? { payer_phone: payerPhone } : {}),
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-orders'] });
      qc.invalidateQueries({ queryKey: ['my-orders-infinite'] });
      qc.invalidateQueries({ queryKey: ['wallet'] });
      useCart.getState().clear();
    },
  });
}

export function useConfirmReception() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string): Promise<Order> => {
      const { order } = await apiPost<{ order: Order }>({
        path: '/confirm-receipt',
        body: { order_id: orderId },
      });
      return order;
    },
    onSuccess: (order) => {
      qc.invalidateQueries({ queryKey: ['order', order.id] });
      qc.invalidateQueries({ queryKey: ['my-orders'] });
      qc.invalidateQueries({ queryKey: ['my-orders-infinite'] });
      qc.invalidateQueries({ queryKey: ['wallet'] });
    },
  });
}

export type DisputeReason = 'damaged' | 'wrong' | 'not_received';

export interface DisputeOrderInput {
  orderId: string;
  reason: DisputeReason;
  note?: string;
}

export function useDisputeOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, reason, note }: DisputeOrderInput): Promise<Order> => {
      const { order } = await apiPost<{ order: Order }>({
        path: '/dispute-order',
        body: { order_id: orderId, reason, note },
      });
      return order;
    },
    onSuccess: (order) => {
      qc.invalidateQueries({ queryKey: ['order', order.id] });
      qc.invalidateQueries({ queryKey: ['my-orders'] });
      qc.invalidateQueries({ queryKey: ['my-orders-infinite'] });
      qc.invalidateQueries({ queryKey: ['wallet'] });
    },
  });
}
