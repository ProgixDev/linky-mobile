// Self-serve account deletion (driver Mon compte + marketplace Confidentialité,
// and a Play Store account-deletion requirement).
//
// V1 semantics: SOFT delete. The users row survives (status='deleted') because
// the append-only ledger, orders and bookings reference it — but every way to
// reach or use the account is severed:
//   - PII anonymised (display_name, avatar), phones/emails rows deleted so the
//     identifiers are freed for a fresh signup (find_or_create_* creates a NEW
//     user afterwards — no resurrection),
//   - all sessions deleted (refresh dies now; access token dies at its TTL),
//   - push tokens deleted,
//   - active listings paused, money-free bookings and pending visit requests
//     cancelled.
//
// Money guards — deletion is REFUSED (409) while value is still in motion:
//   - non-zero wallet balance (withdraw first),
//   - orders still inside escrow (buyer or seller side),
//   - bookings with money in escrow (paid/active/disputed, either side),
//   - pending withdrawal requests,
//   - livreur deliveries under way.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

type Body = Record<string, never>;

function valid(b: unknown): b is Body {
  return typeof b === 'object' && b !== null;
}

// Orders holding (or about to hold) escrow. 'released'/'cancelled' are terminal.
const OPEN_ORDER_STATUSES = ['placed', 'paid', 'preparing', 'delivered', 'disputed'];
const OPEN_BOOKING_STATUSES = ['paid', 'active', 'disputed'];
const OPEN_DELIVERY_STATUSES = ['assigned', 'in_transit'];

Deno.serve(makePost<Body>('/v1/account/delete', valid, async ({ sb, req }) => {
  const userId = await requireUser(req);

  const { data: user, error: eUser } = await sb
    .from('users')
    .select('id, status')
    .eq('id', userId)
    .maybeSingle();
  if (eUser) { console.error('[delete-account] user lookup:', eUser); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
  if (!user) throwApi('USER_NOT_FOUND', 404, 'Compte introuvable.');
  // Idempotent: a second tap after a slow first response just succeeds.
  if (user.status === 'deleted') return { body: { deleted: true } };

  // ---- Guard 1 : wallet must be empty ------------------------------------
  const { data: balances, error: eBal } = await sb.rpc('get_wallet_balances', { p_user_id: userId });
  if (eBal) { console.error('[delete-account] balances:', eBal); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
  const nonZero = (balances ?? []).find((b: { balance_minor: number }) => Number(b.balance_minor) !== 0);
  if (nonZero) {
    throwApi('WALLET_NOT_EMPTY', 409, 'Ton portefeuille contient encore de l\'argent. Retire ton solde avant de supprimer le compte.');
  }

  // ---- Guard 2 : no order still inside escrow (either side) ---------------
  const { count: openOrders, error: eOrd } = await sb
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .in('status', OPEN_ORDER_STATUSES);
  if (eOrd) { console.error('[delete-account] orders:', eOrd); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
  if ((openOrders ?? 0) > 0) {
    throwApi('OPEN_ORDERS', 409, 'Des commandes sont encore en cours. Termine-les (ou attends leur clôture) avant de supprimer le compte.');
  }

  // ---- Guard 3 : no booking with money in escrow (either side) ------------
  const { count: openBookings, error: eBk } = await sb
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .or(`tenant_id.eq.${userId},landlord_id.eq.${userId}`)
    .in('status', OPEN_BOOKING_STATUSES);
  if (eBk) { console.error('[delete-account] bookings:', eBk); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
  if ((openBookings ?? 0) > 0) {
    throwApi('OPEN_BOOKINGS', 409, 'Une réservation payée est encore en cours. Elle doit se terminer avant la suppression du compte.');
  }

  // ---- Guard 4 : no pending withdrawal ------------------------------------
  const { count: pendingWd, error: eWd } = await sb
    .from('withdrawal_requests')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'pending');
  if (eWd) { console.error('[delete-account] withdrawals:', eWd); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
  if ((pendingWd ?? 0) > 0) {
    throwApi('PENDING_WITHDRAWAL', 409, 'Un retrait est en cours de traitement. Attends sa clôture avant de supprimer le compte.');
  }

  // ---- Guard 5 : livreur — no delivery under way ---------------------------
  const { count: openDeliveries, error: eDel } = await sb
    .from('deliveries')
    .select('id', { count: 'exact', head: true })
    .eq('livreur_id', userId)
    .in('status', OPEN_DELIVERY_STATUSES);
  if (eDel) { console.error('[delete-account] deliveries:', eDel); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
  if ((openDeliveries ?? 0) > 0) {
    throwApi('OPEN_DELIVERIES', 409, 'Une livraison est encore en cours. Termine-la avant de supprimer le compte.');
  }

  // ---- Sever the account ----------------------------------------------------
  // Order matters only loosely; every step is idempotent. Failures after the
  // users UPDATE leave a deleted account with residual rows — the retry path
  // (idempotent branch above) re-runs the cleanup below? No: keep the UPDATE
  // LAST so any partial failure leaves the account intact and retryable.
  const cleanups: { table: string; error: unknown }[] = [];

  const del = async (table: string, match: (q: ReturnType<typeof sb.from>) => unknown) => {
    // deno-lint-ignore no-explicit-any
    const q: any = sb.from(table);
    const { error } = await match(q);
    if (error) cleanups.push({ table, error });
  };

  await del('sessions', (q) => q.delete().eq('user_id', userId));
  await del('push_tokens', (q) => q.delete().eq('user_id', userId));
  await del('phones', (q) => q.delete().eq('user_id', userId));
  await del('emails', (q) => q.delete().eq('user_id', userId));

  // Pause the user's public listings (products live under their shops).
  const { data: shops, error: eShops } = await sb.from('shops').select('id').eq('owner_id', userId);
  if (eShops) cleanups.push({ table: 'shops', error: eShops });
  const shopIds = (shops ?? []).map((s: { id: string }) => s.id);
  if (shopIds.length > 0) {
    await del('products', (q) => q.update({ status: 'paused' }).in('shop_id', shopIds).eq('status', 'active'));
  }
  await del('properties', (q) => q.update({ status: 'paused' }).eq('owner_id', userId).eq('status', 'active'));

  // Money-free bookings + pending visit requests: cancel rather than dangle.
  // .is('stripe_pi_id', null) guards an 'accepted' booking that already has a
  // captured-but-not-yet-webhooked charge (booking-sign-pay stamps stripe_pi_id
  // while status is still 'accepted') — cancelling it here would strand the
  // charge (review 2026-07-07). Such a booking is left for the webhook to
  // settle → 'paid' (then the escrow guard above blocks deletion) or for the
  // 24h PI sweep to clear its stripe_pi_id.
  await del('bookings', (q) =>
    q.update({ status: 'cancelled' })
      .or(`tenant_id.eq.${userId},landlord_id.eq.${userId}`)
      .in('status', ['requested', 'accepted'])
      .is('stripe_pi_id', null));
  await del('visit_requests', (q) => q.update({ status: 'cancelled' }).eq('buyer_id', userId).eq('status', 'pending'));

  if (cleanups.length > 0) {
    console.error('[delete-account] cleanup failures:', JSON.stringify(cleanups.map((c) => c.table)), cleanups[0].error);
    throwApi('INTERNAL_ERROR', 500, 'Suppression impossible pour le moment. Réessaie.');
  }

  const { error: eUp } = await sb
    .from('users')
    .update({ status: 'deleted', display_name: 'Compte supprimé', avatar_url: null })
    .eq('id', userId);
  if (eUp) { console.error('[delete-account] user update:', eUp); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }

  console.log(`[delete-account] user ${userId} soft-deleted`);
  return { body: { deleted: true } };
}));
