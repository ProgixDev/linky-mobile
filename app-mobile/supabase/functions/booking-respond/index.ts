// Landlord responds to a booking request: ACCEPT = signs the contract
// (hold-to-confirm client-side; landlord_signed_at stamped here) and the
// booking waits for the tenant's signature + payment. REJECT closes it.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { notifyDetached, displayNameOf } from '@shared/push.ts';

interface Body { booking_id: string; decision: 'accept' | 'reject' }

const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.booking_id !== 'string' || !UUID_RE.test(x.booking_id)) return false;
  return x.decision === 'accept' || x.decision === 'reject';
}

Deno.serve(makePost<Body>('/v1/bookings/respond', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const { data: bk, error: eBk } = await sb
    .from('bookings')
    .select('id, landlord_id, tenant_id, property_id, status, period, start_date, end_date, property_snapshot')
    .eq('id', body.booking_id)
    .maybeSingle();
  if (eBk) { console.error('[booking-respond] lookup:', eBk); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
  if (!bk) throwApi('BOOKING_NOT_FOUND', 404, 'Réservation introuvable.');
  if (bk.landlord_id !== userId) throwApi('FORBIDDEN', 403, 'Action refusée.');
  if (bk.status !== 'requested') throwApi('INVALID_STATUS', 409, 'Cette demande a déjà été traitée.');

  if (body.decision === 'accept') {
    // Re-check availability at accept time. Includes other ACCEPTED bookings —
    // two overlapping bookings must never both reach 'accepted', or both
    // tenants could pay (review DEFECT-1). The landlord accepts one at a time.
    const { data: others } = await sb
      .from('bookings')
      .select('id, period, start_date, end_date')
      .eq('property_id', bk.property_id)
      .in('status', ['accepted', 'paid', 'active'])
      .neq('id', bk.id);
    const conflict = (others ?? []).some((o) => {
      if (o.period === 'month' || bk.period === 'month') return true;
      return o.start_date < (bk.end_date as string) && bk.start_date < (o.end_date as string);
    });
    if (conflict) throwApi('DATES_UNAVAILABLE', 409, 'Ces dates ne sont plus disponibles.');
  }

  const nextStatus = body.decision === 'accept' ? 'accepted' : 'rejected';
  const eventLabel = body.decision === 'accept'
    ? 'Contrat signé par le propriétaire — en attente de ta signature et du paiement'
    : 'Demande refusée par le propriétaire';

  // Events are appended in the SAME status-guarded update: if a concurrent
  // cancel/respond wins the transition, this update no-ops entirely, so the
  // audit trail can never be clobbered by a stale snapshot.
  const { data: evRow } = await sb.from('bookings').select('events').eq('id', bk.id).maybeSingle();
  const events = Array.isArray(evRow?.events) ? evRow!.events : [];
  const { data: updated, error: eUp } = await sb
    .from('bookings')
    .update({
      status: nextStatus,
      ...(body.decision === 'accept' ? { landlord_signed_at: new Date().toISOString() } : {}),
      events: [...events, { at: new Date().toISOString(), label: eventLabel }],
      updated_at: new Date().toISOString(),
    })
    .eq('id', bk.id)
    .eq('status', 'requested') // double-tap safety
    .select('id')
    .maybeSingle();
  if (eUp) { console.error('[booking-respond] update:', eUp); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
  if (!updated) throwApi('INVALID_STATUS', 409, 'Cette demande a déjà été traitée.');

  const landlordName = await displayNameOf(sb, userId);
  const title = ((bk.property_snapshot as { title?: string } | null)?.title) ?? 'le bien';
  notifyDetached(sb, {
    userIds: [bk.tenant_id as string],
    category: 'booking',
    title: body.decision === 'accept' ? 'Réservation acceptée' : 'Réservation refusée',
    body: body.decision === 'accept'
      ? `${landlordName} a signé le contrat pour « ${title} ». Signe et paie pour finaliser.`
      : `${landlordName} a refusé ta demande pour « ${title} ».`,
    iconHint: body.decision === 'accept' ? 'check' : 'shield',
    deeplink: `/bookings/${bk.id}`,
    refType: 'booking',
    refId: bk.id,
    app: 'marketplace',
  });

  return { body: { ok: true, status: nextStatus } };
}));
