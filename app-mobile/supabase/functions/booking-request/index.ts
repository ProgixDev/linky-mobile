// Tenant requests a rental booking (location par jour / par mois). Creates the
// booking at status 'requested' with a money + contract snapshot; the landlord
// then accepts & signs (booking-respond), the tenant signs & pays
// (booking-sign-pay → stripe-webhook → confirm_booking_payment). The visit is
// OPTIONAL for rentals (client decision 2026-07).
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { notifyDetached, displayNameOf, formatGNF } from '@shared/push.ts';

interface Body {
  property_id: string;
  period: 'day' | 'month';
  start_date: string;      // 'YYYY-MM-DD'
  end_date?: string;       // daily only, exclusive check-out
  months?: number;         // monthly only, 1..36
  note?: string;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NIGHTS = 90;

function parseDate(s: string): Date | null {
  if (!DATE_RE.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  // Reject silent roll-overs ('2026-02-31' → Mar 3): the round-trip must match.
  if (d.toISOString().slice(0, 10) !== s) return null;
  return d;
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.property_id !== 'string' || !UUID_RE.test(x.property_id)) return false;
  if (x.period !== 'day' && x.period !== 'month') return false;
  if (typeof x.start_date !== 'string' || !DATE_RE.test(x.start_date)) return false;
  if (x.period === 'day') {
    if (typeof x.end_date !== 'string' || !DATE_RE.test(x.end_date)) return false;
  } else {
    if (typeof x.months !== 'number' || !Number.isInteger(x.months) || x.months < 1 || x.months > 36) return false;
  }
  if (x.note !== undefined && (typeof x.note !== 'string' || x.note.length > 500)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/bookings/request', valid, async ({ sb, body, req }) => {
  const tenantId = await requireUser(req);

  const start = parseDate(body.start_date);
  if (!start) throwApi('INVALID_DATES', 400, 'Date de début invalide.');
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  if (start.getTime() < today.getTime()) {
    throwApi('INVALID_DATES', 400, 'La date de début est déjà passée.');
  }
  // Bound how far ahead a booking can start (sanity, mirrors visits' 60d rule).
  if (start.getTime() > today.getTime() + 180 * 86_400_000) {
    throwApi('INVALID_DATES', 400, 'La date de début est trop éloignée (6 mois max).');
  }

  let nights = 0;
  if (body.period === 'day') {
    const end = parseDate(body.end_date!);
    if (!end) throwApi('INVALID_DATES', 400, 'Date de fin invalide.');
    nights = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    if (nights < 1 || nights > MAX_NIGHTS) {
      throwApi('INVALID_DATES', 400, `Durée invalide (1 à ${MAX_NIGHTS} nuits).`);
    }
  }

  // Property must be an active rental, billing period must match, no self-booking.
  const { data: prop, error: eProp } = await sb
    .from('properties_with_cover')
    .select('id, owner_id, type, status, title, city, district, price_minor, per_month, cover_url')
    .eq('id', body.property_id)
    .maybeSingle();
  if (eProp) { console.error('[booking-request] property lookup:', eProp); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
  if (!prop) throwApi('PROPERTY_NOT_FOUND', 404, 'Annonce introuvable.');
  if (prop.type !== 'location') throwApi('NOT_A_RENTAL', 400, 'Cette annonce n\'est pas une location.');
  if (prop.status !== 'active') throwApi('PROPERTY_INACTIVE', 409, 'Cette annonce n\'est plus disponible.');
  if (prop.owner_id === tenantId) throwApi('SELF_BOOKING_FORBIDDEN', 400, 'Tu ne peux pas réserver ton propre bien.');
  const expectedPeriod = prop.per_month ? 'month' : 'day';
  if (body.period !== expectedPeriod) {
    throwApi('PERIOD_MISMATCH', 400, prop.per_month ? 'Ce bien se loue au mois.' : 'Ce bien se loue à la journée.');
  }

  // Overlap guard: no other booking already paid/active on this property for
  // the requested window (daily) or at all (monthly). Advisory (re-checked at
  // accept + payment-confirm time).
  const { data: existing } = await sb
    .from('bookings')
    .select('id, period, start_date, end_date, status')
    .eq('property_id', prop.id)
    .in('status', ['paid', 'active']);
  const endStr = body.period === 'day' ? body.end_date! : null;
  const overlaps = (existing ?? []).some((b) => {
    if (b.period === 'month') return true; // an active monthly lease blocks everything
    if (body.period === 'month') return true; // monthly request blocked by any paid stay
    return b.start_date < endStr! && body.start_date < (b.end_date as string);
  });
  if (overlaps) throwApi('DATES_UNAVAILABLE', 409, 'Ces dates ne sont plus disponibles.');

  // Money snapshot — buyer pays the 3% fee on top; the landlord receives the
  // full rent amount (fee model verified 2026-06-10).
  const rent = Number(prop.price_minor);
  const amount = body.period === 'day' ? rent * nights : rent;
  const fees = Math.round(amount * 0.03);
  const total = amount + fees;

  const tenantName = await displayNameOf(sb, tenantId);
  const landlordName = await displayNameOf(sb, prop.owner_id as string);

  const snapshot = {
    title: prop.title, city: prop.city, district: prop.district,
    cover_url: prop.cover_url ?? null, price_minor: rent, per_month: prop.per_month,
  };
  // The in-app contract both parties review then sign (hold-to-confirm).
  const contract = {
    version: 1,
    landlord_name: landlordName,
    tenant_name: tenantName,
    property_title: prop.title,
    property_location: [prop.district, prop.city].filter(Boolean).join(', '),
    period: body.period,
    start_date: body.start_date,
    end_date: endStr,
    months: body.period === 'month' ? body.months : null,
    rent_minor: rent,
    amount_minor: amount,
    fees_minor: fees,
    total_minor: total,
    clauses: [
      "Le locataire verse via Linky le montant indiqué ; les fonds sont conservés en séquestre jusqu'à la confirmation de l'emménagement.",
      "À la remise des clés, le locataire confirme l'emménagement dans l'application et le loyer est versé au propriétaire.",
      body.period === 'month'
        ? 'Les loyers des mois suivants sont réglés directement entre les parties, aux échéances convenues au présent contrat.'
        : 'Le présent contrat couvre la totalité du séjour indiqué.',
      'En cas de désaccord, les parties peuvent ouvrir un litige via Linky ; une médiation est proposée sous 48 heures.',
      'Le présent contrat est régi par le droit guinéen.',
    ],
  };

  const { data: created, error: eIns } = await sb
    .from('bookings')
    .insert({
      property_id: prop.id,
      tenant_id: tenantId,
      landlord_id: prop.owner_id,
      period: body.period,
      start_date: body.start_date,
      end_date: endStr,
      months: body.period === 'month' ? body.months : null,
      rent_minor: rent,
      amount_minor: amount,
      fees_minor: fees,
      total_minor: total,
      property_snapshot: snapshot,
      note: body.note?.trim() ?? '',
      contract,
      events: [{ at: new Date().toISOString(), label: 'Demande de réservation envoyée' }],
    })
    .select('id')
    .single();
  if (eIns || !created) {
    console.error('[booking-request] insert error:', eIns);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  notifyDetached(sb, {
    userIds: [prop.owner_id as string],
    category: 'booking',
    title: 'Nouvelle demande de réservation',
    body: `${tenantName} veut louer « ${prop.title} » (${formatGNF(total)}).`,
    iconHint: 'check',
    deeplink: `/agent/leases/${created.id}`,
    refType: 'booking',
    refId: created.id,
    app: 'marketplace',
  });

  return { body: { booking_id: created.id } };
}));
