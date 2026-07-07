// Admin — resolve a paid/disputed booking. The write half of the admin
// bookings module (migration 20260707_01 holds the transactional logic):
//   refund  : escrow → tenant (rent + fee), status 'refunded', monthly
//             property un-reserved
//   release : escrow → landlord + platform fee, status 'active'
//   dispute : freeze marker 'paid' → 'disputed' (no money)
//
// Auth: requireUser → assertAdmin; the RPC re-checks is_admin inside the
// transaction (load-bearing guard, same posture as resolve-dispute).
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';
import { notifyDetached, formatGNF } from '@shared/push.ts';

interface Body {
  booking_id: string;
  action: 'refund' | 'release' | 'dispute';
  reason?: string;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.booking_id !== 'string' || !UUID_RE.test(x.booking_id)) return false;
  if (x.action !== 'refund' && x.action !== 'release' && x.action !== 'dispute') return false;
  if (x.reason !== undefined && (typeof x.reason !== 'string' || x.reason.length > 500)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/admin/bookings/resolve', valid, async ({ sb, body, req }) => {
  const adminId = await requireUser(req);
  await assertAdmin(sb, adminId);

  const { data: newStatus, error } = await sb.rpc('admin_resolve_booking', {
    p_admin_id: adminId,
    p_booking_id: body.booking_id,
    p_action: body.action,
    p_reason: body.reason ?? null,
  });
  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('booking_not_found')) throwApi('BOOKING_NOT_FOUND', 404, 'Réservation introuvable.');
    if (msg.includes('invalid_status')) throwApi('INVALID_STATUS', 409, 'Cette réservation n\'est pas dans un état résoluble (paid/disputed requis).');
    if (msg.includes('invalid_action')) throwApi('INVALID_ACTION', 400, 'Action inconnue.');
    if (msg.includes('not_admin')) throwApi('FORBIDDEN_ADMIN', 403, 'Accès admin requis.');
    if (msg.includes('user_not_found')) throwApi('USER_NOT_FOUND', 404, 'Utilisateur inconnu.');
    console.error('[admin-resolve-booking] rpc error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  // Read back for the notification copy (amounts + parties).
  const { data: bk } = await sb
    .from('bookings')
    .select('id, tenant_id, landlord_id, amount_minor, total_minor, property:properties ( title )')
    .eq('id', body.booking_id)
    .maybeSingle();

  if (bk) {
    const title = (bk.property as { title?: string } | null)?.title ?? 'votre logement';
    if (body.action === 'refund') {
      notifyDetached(sb, {
        userIds: [bk.tenant_id as string],
        category: 'booking',
        title: 'Réservation remboursée',
        body: `L'équipe Linky t'a remboursé ${formatGNF(Number(bk.total_minor))} pour « ${title} ». Le montant est sur ton wallet.`,
        iconHint: 'check',
        deeplink: `/bookings/${bk.id}`,
        refType: 'booking',
        refId: bk.id as string,
        app: 'marketplace',
      });
      notifyDetached(sb, {
        userIds: [bk.landlord_id as string],
        category: 'booking',
        title: 'Réservation remboursée au locataire',
        body: `L'équipe Linky a remboursé la réservation de « ${title} » au locataire.`,
        iconHint: 'shield',
        deeplink: `/agent/leases/${bk.id}`,
        refType: 'booking',
        refId: bk.id as string,
        app: 'marketplace',
      });
    } else if (body.action === 'release') {
      notifyDetached(sb, {
        userIds: [bk.landlord_id as string],
        category: 'booking',
        title: 'Loyer versé',
        body: `L'équipe Linky a validé la réservation de « ${title} » — ${formatGNF(Number(bk.amount_minor))} versés sur ton wallet.`,
        iconHint: 'check',
        deeplink: `/agent/leases/${bk.id}`,
        refType: 'booking',
        refId: bk.id as string,
        app: 'marketplace',
      });
    }
  }

  return { body: { ok: true, status: newStatus } };
}));
