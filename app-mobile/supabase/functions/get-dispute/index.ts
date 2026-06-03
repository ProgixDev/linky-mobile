// Admin order detail with its full admin_actions history.
//
// Auth: requireUser → assertAdmin. Non-admins receive 403 FORBIDDEN_ADMIN.
//
// Scope: callable on any order_id (not just disputed). Admins need to inspect
// already-resolved orders too — disputes that came back, reverse-resolution
// audits, retrospective KYC checks — so we don't gate on status. The
// list-disputes endpoint is the one that filters by status='disputed'.
//
// Mapper: includeAdminMeta: true (admin sees admin_id in dispute_resolved
// events). includeScanToken: false (admin isn't the seller; QR isn't theirs).
//
// admin_actions are returned newest-first so the console can render a reverse-
// chronological timeline without flipping the array client-side.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';
import {
  mapOrder,
  mapAdminAction,
  type OrderRow,
  type AdminActionRow,
} from '@shared/catalog.ts';

interface Body { order_id: string }

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  return typeof x.order_id === 'string' && /^[0-9a-f-]{36}$/i.test(x.order_id);
}

Deno.serve(makePost<Body>('/v1/admin/disputes/get', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);
  await assertAdmin(sb, userId);

  const { data: orderRow, error: orderErr } = await sb
    .from('orders')
    .select('id, reference, buyer_id, seller_id, shop_id, product_id, product_snapshot, quantity, amount_minor, fees_minor, total_minor, payment_method, currency, status, events, release_at, created_at')
    .eq('id', body.order_id)
    .maybeSingle();
  if (orderErr) {
    console.error('[get-dispute] order select error:', orderErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lecture commande');
  }
  if (!orderRow) throwApi('ORDER_NOT_FOUND', 404, 'Commande introuvable.');

  const { data: actionRows, error: actionsErr } = await sb
    .from('admin_actions')
    .select('id, admin_id, target_type, target_id, action, reason, metadata, before_snapshot, after_snapshot, created_at')
    .eq('target_type', 'order')
    .eq('target_id', body.order_id)
    .order('created_at', { ascending: false });
  if (actionsErr) {
    console.error('[get-dispute] admin_actions select error:', actionsErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lecture historique admin');
  }

  return {
    body: {
      order: mapOrder(orderRow as OrderRow, { includeAdminMeta: true }),
      admin_actions: ((actionRows as AdminActionRow[] | null) ?? []).map(mapAdminAction),
    },
  };
}));
