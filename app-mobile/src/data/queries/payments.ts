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

/** Kulu (2026-09-07) : l'acheteur reçoit un code par SMS et le saisit.
 *
 *  Un succès ici ne veut PAS dire « payé » — Lengopay accuse seulement réception
 *  du code. C'est le sondage habituel qui tranche, donc l'écran enchaîne sur la
 *  même surface d'attente que les autres rails. Rien n'est invalidé : aucun état
 *  n'a encore changé côté serveur. */
export function useConfirmPaymentOtp() {
  return useMutation({
    mutationFn: async ({ payId, code }: { payId: string; code: string }): Promise<void> => {
      await apiPost<{ accepted: true }>({
        path: '/lengopay-confirm-otp',
        body: { pay_id: payId, code },
      });
    },
  });
}
