// O.3 hook #2 — rail twin of the place-order wallet-branch push, shared by
// cron-poll-intents (Lengopay) and stripe-webhook (Phase Q). Fully
// self-contained try/catch : a failure here must NOT bubble into the caller
// (the intent is already terminal — any compensating action would be wrong).
import type { SupabaseClient } from '@shared/db.ts';
import { notifyDetached, displayNameOf, formatGNF } from '@shared/push.ts';

export async function notifyOrderPaid(sb: SupabaseClient, intentId: string): Promise<void> {
  try {
    const { data, error } = await sb
      .from('payment_intents')
      .select('order_id, orders!inner ( id, buyer_id, seller_id, total_minor, status )')
      .eq('id', intentId)
      .maybeSingle();
    if (error || !data) {
      if (error) console.error('[order-paid-push] notify fetch failed:', error);
      return;
    }
    const order = (data as unknown as {
      orders: { id: string; buyer_id: string; seller_id: string; total_minor: number | string; status: string } | null;
    }).orders;
    if (!order || order.status !== 'paid') return;

    const buyerName = await displayNameOf(sb, order.buyer_id);
    notifyDetached(sb, {
      userIds: [order.seller_id],
      category: 'order',
      title: 'Nouvelle commande payée',
      body: `${buyerName} a payé ${formatGNF(Number(order.total_minor))} — prépare la commande.`,
      iconHint: 'check',
      deeplink: `/seller/orders/${order.id}`,
      refType: 'order',
      refId: order.id,
    });
  } catch (e) {
    console.error('[order-paid-push] notifyOrderPaid failed:', e);
  }
}
