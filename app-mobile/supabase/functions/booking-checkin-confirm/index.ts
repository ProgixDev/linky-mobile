// Tenant confirms move-in / key handover → release_booking RPC pays the
// landlord from escrow (full rent; platform keeps the 3% buyer fee) and the
// booking becomes 'active'. The RPC re-asserts tenant + status under lock.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { notifyDetached, formatGNF } from '@shared/push.ts';

interface Body { booking_id: string }

const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  return typeof x.booking_id === 'string' && UUID_RE.test(x.booking_id);
}

Deno.serve(makePost<Body>('/v1/bookings/checkin-confirm', valid, async ({ sb, body, req }) => {
  const tenantId = await requireUser(req);

  const { error: eRpc } = await sb.rpc('release_booking', {
    p_booking_id: body.booking_id,
    p_tenant_id: tenantId,
  });
  if (eRpc) {
    const msg = (eRpc as { message?: string }).message ?? '';
    if (msg.includes('BOOKING_NOT_FOUND')) throwApi('BOOKING_NOT_FOUND', 404, 'Réservation introuvable.');
    if (msg.includes('FORBIDDEN')) throwApi('FORBIDDEN', 403, 'Action refusée.');
    if (msg.includes('INVALID_STATUS')) throwApi('INVALID_STATUS', 409, 'Cette réservation ne peut pas être confirmée.');
    console.error('[booking-checkin-confirm] rpc error:', eRpc);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lors du versement.');
  }

  // Notify the landlord that the rent has been released.
  const { data: bk } = await sb
    .from('bookings')
    .select('landlord_id, amount_minor, property_snapshot')
    .eq('id', body.booking_id)
    .maybeSingle();
  if (bk) {
    const title = ((bk.property_snapshot as { title?: string } | null)?.title) ?? 'votre bien';
    notifyDetached(sb, {
      userIds: [bk.landlord_id as string],
      category: 'booking',
      title: 'Loyer versé',
      body: `Emménagement confirmé pour « ${title} » — ${formatGNF(Number(bk.amount_minor))} versés sur ton wallet.`,
      iconHint: 'check',
      deeplink: `/agent/leases/${body.booking_id}`,
      refType: 'booking',
      refId: body.booking_id,
      app: 'marketplace',
    });
  }

  return { body: { ok: true } };
}));
