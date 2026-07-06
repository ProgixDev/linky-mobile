// Tenant cancels their own booking BEFORE any money moved (requested/accepted).
// Paid bookings can't be cancelled here — that's the dispute/refund path (V1.1).
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { notifyDetached, displayNameOf } from '@shared/push.ts';

interface Body { booking_id: string }

const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  return typeof x.booking_id === 'string' && UUID_RE.test(x.booking_id);
}

Deno.serve(makePost<Body>('/v1/bookings/cancel', valid, async ({ sb, body, req }) => {
  const tenantId = await requireUser(req);

  const { data: bk, error: eBk } = await sb
    .from('bookings')
    .select('id, tenant_id, landlord_id, status, events, property_snapshot')
    .eq('id', body.booking_id)
    .maybeSingle();
  if (eBk) { console.error('[booking-cancel] lookup:', eBk); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
  if (!bk) throwApi('BOOKING_NOT_FOUND', 404, 'Réservation introuvable.');
  if (bk.tenant_id !== tenantId) throwApi('FORBIDDEN', 403, 'Action refusée.');
  if (bk.status !== 'requested' && bk.status !== 'accepted') {
    throwApi('INVALID_STATUS', 409, 'Cette réservation ne peut plus être annulée dans l\'application.');
  }

  const events = Array.isArray(bk.events) ? bk.events : [];
  const { data: updated, error: eUp } = await sb
    .from('bookings')
    .update({
      status: 'cancelled',
      events: [...events, { at: new Date().toISOString(), label: 'Réservation annulée par le locataire' }],
      updated_at: new Date().toISOString(),
    })
    .eq('id', bk.id)
    .in('status', ['requested', 'accepted'])
    .select('id')
    .maybeSingle();
  if (eUp) { console.error('[booking-cancel] update:', eUp); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
  if (!updated) throwApi('INVALID_STATUS', 409, 'Cette réservation a déjà changé d\'état.');

  const tenantName = await displayNameOf(sb, tenantId);
  const title = ((bk.property_snapshot as { title?: string } | null)?.title) ?? 'votre bien';
  notifyDetached(sb, {
    userIds: [bk.landlord_id as string],
    category: 'booking',
    title: 'Réservation annulée',
    body: `${tenantName} a annulé sa demande pour « ${title} ».`,
    iconHint: 'shield',
    deeplink: `/agent/leases/${bk.id}`,
    refType: 'booking',
    refId: bk.id,
    app: 'marketplace',
  });

  return { body: { ok: true } };
}));
