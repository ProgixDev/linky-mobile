// Modifier-flow helper: cancel the current pending payment intent for an order.
// No escrow movement (intent was pending, never completed). Frontend chains
// this with usePlaceOrder to retry with a different phone on a fresh order.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';

export function useCancelPendingPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId }: { orderId: string }): Promise<void> => {
      await apiPost<{ ok: true }>({
        path: '/cancel-pending-payment',
        body: { order_id: orderId },
      });
    },
    onSuccess: (_, { orderId }) => {
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      qc.invalidateQueries({ queryKey: ['my-orders'] });
      qc.invalidateQueries({ queryKey: ['my-orders-infinite'] });
    },
  });
}
