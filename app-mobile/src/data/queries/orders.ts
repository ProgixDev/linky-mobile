// Wired to live edge functions: place-order / get-order / list-my-orders. All
// authed — list/get use the JWT to scope to the caller (buyer; participant for
// get). H1 covers order creation + reads only; the escrow lifecycle
// (confirm-receipt RPC, dispute paths, wallet debit/release) lands in H2, so
// useConfirmReception stays stubbed below until then.
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';
import { useCart } from '../../stores/cart';
import type { Order, OrderStatus, PaymentMethod } from '../types';

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

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: ['order', id],
    enabled: !!id,
    queryFn: async (): Promise<Order | undefined> => {
      const { order } = await apiPost<{ order: Order }>({
        path: '/get-order',
        body: { id },
      });
      return order;
    },
  });
}

export interface PlaceOrderInput {
  productId: string;
  quantity: number;
  paymentMethod: PaymentMethod;
}

export function usePlaceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, quantity, paymentMethod }: PlaceOrderInput): Promise<Order> => {
      const { order } = await apiPost<{ order: Order }>({
        path: '/place-order',
        body: {
          product_id: productId,
          quantity,
          payment_method: paymentMethod,
        },
      });
      return order;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-orders'] });
      qc.invalidateQueries({ queryKey: ['my-orders-infinite'] });
      qc.invalidateQueries({ queryKey: ['wallet'] });
      useCart.getState().clear();
    },
  });
}

// H2 placeholder: confirm-receipt RPC lands with the escrow lifecycle. Kept as
// a stub so app/order/[id].tsx keeps compiling; the optimistic UI state shift
// is the only effect today.
export function useConfirmReception() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      await new Promise((r) => setTimeout(r, 600));
      return orderId;
    },
    onSuccess: (orderId) => {
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      qc.invalidateQueries({ queryKey: ['my-orders'] });
    },
  });
}
