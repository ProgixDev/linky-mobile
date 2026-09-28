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
// events). includeScanToken: false — le QR appartient a l'ACHETEUR seul
// (sens inverse le 2026-08-22 ; cf. l'en-tete de mapOrder). Un admin n'a
// aucune raison de le detenir : il ne remet aucune marchandise.
//
// admin_actions are returned newest-first so the console can render a reverse-
// chronological timeline without flipping the array client-side.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';
import {
  mapOrder,
  mapOrderItem,
  mapAdminAction,
  ORDER_ITEM_COLUMNS,
  type OrderRow,
  type OrderItemRow,
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

  // ┌─ LES LIGNES DE LA COMMANDE, QUI MANQUAIENT ───────────────────────────┐
  // L'en-tete de commande ne porte que l'article PRINCIPAL, et son instantane
  // n'a jamais porte la combinaison : ni `variantId` ni `variantLabel`. La
  // console montrait donc un titre, une quantite et un prix -- et un
  // administrateur devait trancher « mauvaise taille » sans pouvoir savoir
  // laquelle avait ete commandee. Sur le seul ecran ou l'argent bouge.
  //
  // Les lignes, elles, portent la combinaison FIGEE a la commande. On les lit
  // avec le MEME mappeur et les MEMES colonnes que get-order : l'administrateur
  // et l'acheteur doivent voir la meme chose, sinon l'arbitrage porte sur autre
  // chose que le litige.
  //
  // Une erreur de lecture n'interrompt PAS la reponse : perdre le detail des
  // lignes est une degradation, perdre l'acces au dossier de litige serait une
  // panne. Le tableau revient vide et l'ecran retombe sur l'en-tete.
  // └──────────────────────────────────────────────────────────────────────┘
  const { data: itemRows, error: itemsErr } = await sb
    .from('order_items')
    .select(ORDER_ITEM_COLUMNS)
    .eq('order_id', body.order_id)
    .order('created_at', { ascending: true });
  if (itemsErr) console.error('[get-dispute] order_items select error:', itemsErr);

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
      items: ((itemRows as unknown as OrderItemRow[] | null) ?? []).map(mapOrderItem),
      admin_actions: ((actionRows as AdminActionRow[] | null) ?? []).map(mapAdminAction),
    },
  };
}));
