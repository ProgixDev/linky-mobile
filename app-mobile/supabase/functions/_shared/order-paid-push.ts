// O.3 hook #2 — rail twin of the place-order wallet-branch push, shared by
// cron-poll-intents (Lengopay) and stripe-webhook (Phase Q). Fully
// self-contained try/catch : a failure here must NOT bubble into the caller
// (the intent is already terminal — any compensating action would be wrong).
import type { SupabaseClient } from '@shared/db.ts';
import { notifyDetached, displayNameOf, formatGNF } from '@shared/push.ts';

async function notifyOneOrderPaid(
  sb: SupabaseClient,
  order: { id: string; buyer_id: string; seller_id: string; total_minor: number | string },
  buyerName: string,
): Promise<void> {
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
}

// Une intention peut porter order_id (commande unique) OU batch_id (panier
// multi-boutiques, 2026-08-21). Sans cette distinction, une intention de lot
// ne matchait ni l'un ni l'autre cote de la jointure `orders!inner` : la
// fonction sortait en silence sur `!data`, et AUCUN vendeur d'un lot paye par
// carte n'etait jamais prevenu. Meme trou cote cron Lengopay, corrige au
// meme endroit puisque les deux appellent cette fonction partagee.
export async function notifyOrderPaid(sb: SupabaseClient, intentId: string): Promise<void> {
  try {
    const { data: intentRow, error: intentErr } = await sb
      .from('payment_intents')
      .select('order_id, batch_id')
      .eq('id', intentId)
      .maybeSingle();
    if (intentErr || !intentRow) {
      if (intentErr) console.error('[order-paid-push] intent fetch failed:', intentErr);
      return;
    }

    if (intentRow.batch_id) {
      const { data: orders, error: ordersErr } = await sb
        .from('orders')
        .select('id, buyer_id, seller_id, total_minor, status')
        .eq('batch_id', intentRow.batch_id)
        .eq('status', 'paid');
      if (ordersErr || !orders || orders.length === 0) {
        if (ordersErr) console.error('[order-paid-push] batch orders fetch failed:', ordersErr);
        return;
      }
      // Un seul acheteur pour tout le lot : un seul lookup de nom suffit.
      const buyerName = await displayNameOf(sb, orders[0].buyer_id as string);
      for (const order of orders) {
        await notifyOneOrderPaid(sb, order as never, buyerName);
      }
      return;
    }

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
    await notifyOneOrderPaid(sb, order, buyerName);
  } catch (e) {
    console.error('[order-paid-push] notifyOrderPaid failed:', e);
  }
}
