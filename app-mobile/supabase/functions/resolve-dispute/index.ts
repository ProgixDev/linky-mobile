// Admin resolves a disputed order with a binary verdict (refund | release).
//
// Auth: requireUser → assertAdmin. The admin id is taken from the JWT (sub
// claim), never from the body — preserves the same posture as place-order /
// confirm-receipt where the actor is always derived from the bearer.
//
// Delegates to public.resolve_dispute RPC which holds the transactional
// logic: status check, ledger transfers (release pair → seller+platform, or
// refund pair → buyer×2), event append with admin_id, and admin_actions
// audit insert. The edge fn is mostly translation: validate body, map RPC
// error codes to HTTP, read back the order for the response.
//
// Error map (RPC label → HTTP code):
//   not_admin            → 403 FORBIDDEN_ADMIN
//                          (live re-check inside the RPC; assertAdmin above
//                          should have caught this already, but the RPC
//                          guard is the load-bearing one so we map cleanly)
//   user_not_found       → 404 USER_NOT_FOUND
//                          (admin was promoted then deleted between assert
//                          and RPC — vanishingly rare, but explicit anyway)
//   invalid_outcome      → 400 INVALID_OUTCOME
//                          (edge-side validator should have caught — but
//                          defense in depth maps the SQL raise cleanly)
//   order_not_found      → 404 ORDER_NOT_FOUND
//   invalid_status       → 400 INVALID_STATUS
//                          (order isn't in 'disputed' — already resolved by
//                          another admin or never disputed in the first place)
//
// Response: { ok: true, order: mapOrder(refetched, { includeAdminMeta: true }) }
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';
import { mapOrder, type OrderRow } from '@shared/catalog.ts';
import { notifyDetached, formatGNF } from '@shared/push.ts';

interface Body {
  order_id: string;
  outcome: 'refund' | 'release';
  reason?: string;
  note?: string;
}

const OUTCOMES = new Set(['refund', 'release']);

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.order_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(x.order_id)) return false;
  if (typeof x.outcome !== 'string' || !OUTCOMES.has(x.outcome)) return false;
  if (x.reason !== undefined && (typeof x.reason !== 'string' || x.reason.length > 500)) return false;
  if (x.note   !== undefined && (typeof x.note   !== 'string' || x.note.length   > 500)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/admin/disputes/resolve', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);
  await assertAdmin(sb, userId);

  const { error: rpcErr } = await sb.rpc('resolve_dispute', {
    p_order_id: body.order_id,
    p_admin_id: userId,
    p_outcome:  body.outcome,
    p_reason:   body.reason ?? null,
    p_note:     body.note   ?? null,
  });
  if (rpcErr) {
    const msg = (rpcErr as { message?: string } | null)?.message ?? '';
    console.error('[resolve-dispute] rpc error:', rpcErr);
    if (msg.includes('not_admin'))            throwApi('FORBIDDEN_ADMIN',       403, 'Accès admin requis.');
    if (msg.includes('user_not_found'))       throwApi('USER_NOT_FOUND',        404, 'Utilisateur inconnu.');
    if (msg.includes('invalid_outcome'))      throwApi('INVALID_OUTCOME',       400, 'Verdict invalide (refund ou release).');
    if (msg.includes('order_not_found'))      throwApi('ORDER_NOT_FOUND',       404, 'Commande introuvable.');
    if (msg.includes('invalid_status'))       throwApi('INVALID_STATUS',        400, "La commande n'est pas en litige.");
    // Phase V.4 -- admin is buyer or seller on the order. Admin-facing
    // copy uses "vous-form" since the admin console is a separate
    // surface from the mobile tu-form app.
    if (msg.includes('self_deal_forbidden')) throwApi('FORBIDDEN_SELF_DEAL',   400, "Vous ne pouvez pas trancher un litige sur une commande dont vous etes acheteur ou vendeur.");
    throwApi('INTERNAL_ERROR', 500, 'Erreur résolution litige');
  }

  const { data: row, error: readErr } = await sb
    .from('orders')
    .select('id, reference, buyer_id, seller_id, shop_id, product_id, product_snapshot, quantity, amount_minor, fees_minor, total_minor, payment_method, currency, status, events, release_at, created_at')
    .eq('id', body.order_id)
    .single();
  if (readErr || !row) {
    console.error('[resolve-dispute] readback error:', readErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lecture commande');
  }

  // Outcome-specific copy per role — mirrors the K.6 OrderResolutionBanner
  // wording (adapted to "tu"). Amounts follow the LEDGER (20260602_03):
  // refund returns total_minor to the buyer; release credits the seller the
  // FULL amount_minor (buyer paid the fee on top — nothing off the seller).
  const orderRow = row as OrderRow;
  if (body.outcome === 'refund') {
    notifyDetached(sb, {
      userIds: [orderRow.buyer_id],
      category: 'order',
      title: 'Litige résolu',
      body: `${formatGNF(Number(orderRow.total_minor))} remboursés sur ton wallet.`,
      iconHint: 'shield',
      deeplink: `/order/${orderRow.id}`,
      refType: 'order',
      refId: orderRow.id,
    });
    notifyDetached(sb, {
      userIds: [orderRow.seller_id],
      category: 'order',
      title: "Litige tranché en faveur de l'acheteur",
      body: 'Aucun versement pour cette commande.',
      iconHint: 'shield',
      deeplink: `/seller/orders/${orderRow.id}`,
      refType: 'order',
      refId: orderRow.id,
    });
  } else {
    notifyDetached(sb, {
      userIds: [orderRow.buyer_id],
      category: 'order',
      title: 'Litige clos',
      body: 'Commande libérée au vendeur.',
      iconHint: 'shield',
      deeplink: `/order/${orderRow.id}`,
      refType: 'order',
      refId: orderRow.id,
    });
    notifyDetached(sb, {
      userIds: [orderRow.seller_id],
      category: 'order',
      title: 'Litige résolu en ta faveur',
      body: `${formatGNF(Number(orderRow.amount_minor))} libérés sur ton wallet.`,
      iconHint: 'shield',
      deeplink: `/seller/orders/${orderRow.id}`,
      refType: 'order',
      refId: orderRow.id,
    });
  }

  return {
    body: {
      ok: true,
      order: mapOrder(orderRow, { includeAdminMeta: true }),
    },
  };
}));
