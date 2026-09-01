// Tenant requests a rental booking (location par jour / par mois) OR a buyer
// requests to purchase a vente/terrain listing (period 'sale', 2026-08-31).
// Creates the booking at status 'requested' with a money + contract snapshot;
// the landlord/seller then accepts & signs (booking-respond), the tenant/buyer
// signs & pays (booking-sign-pay → cron-poll-intents → confirm_booking_payment).
// The visit is OPTIONAL for rentals (client decision 2026-07) but MANDATORY
// for a sale — visit-complete's stated purpose since 2026-07, enforced here
// for the first time.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { notifyDetached, displayNameOf, formatGNF } from '@shared/push.ts';

interface Body {
  property_id: string;
  period: 'day' | 'month' | 'sale';
  start_date: string;      // 'YYYY-MM-DD' — for 'sale', a formality (today), not a schedule
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
  if (x.period !== 'day' && x.period !== 'month' && x.period !== 'sale') return false;
  if (typeof x.start_date !== 'string' || !DATE_RE.test(x.start_date)) return false;
  if (x.period === 'day') {
    if (typeof x.end_date !== 'string' || !DATE_RE.test(x.end_date)) return false;
  } else if (x.period === 'month') {
    if (typeof x.months !== 'number' || !Number.isInteger(x.months) || x.months < 1 || x.months > 36) return false;
  }
  // 'sale' needs neither end_date nor months.
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
  if (prop.type === 'location') {
    if (body.period === 'sale') throwApi('NOT_A_RENTAL', 400, 'Cette annonce est une location, pas un bien à vendre.');
  } else if (body.period !== 'sale') {
    // vente / terrain only ever accept a one-time purchase, never day/month.
    throwApi('NOT_A_RENTAL', 400, 'Cette annonce n\'est pas une location.');
  }
  if (prop.status !== 'active') throwApi('PROPERTY_INACTIVE', 409, 'Cette annonce n\'est plus disponible.');
  if (prop.owner_id === tenantId) throwApi('SELF_BOOKING_FORBIDDEN', 400, 'Tu ne peux pas réserver ton propre bien.');

  if (body.period === 'sale') {
    // Visite obligatoire avant achat (raison d'etre de visit-complete depuis
    // 2026-07, jamais appliquee jusqu'ici). Le proprietaire doit avoir marque
    // une visite de CET acheteur comme effectuee.
    const { data: visit, error: eVisit } = await sb
      .from('visit_requests')
      .select('id')
      .eq('property_id', prop.id)
      .eq('buyer_id', tenantId)
      .eq('status', 'completed')
      .limit(1)
      .maybeSingle();
    if (eVisit) { console.error('[booking-request] visit lookup:', eVisit); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
    if (!visit) {
      throwApi('VISIT_REQUIRED', 409, 'Une visite doit être effectuée et confirmée par le propriétaire avant l\'achat.');
    }
  } else {
    const expectedPeriod = prop.per_month ? 'month' : 'day';
    if (body.period !== expectedPeriod) {
      throwApi('PERIOD_MISMATCH', 400, prop.per_month ? 'Ce bien se loue au mois.' : 'Ce bien se loue à la journée.');
    }
  }

  // Overlap guard: no other booking already paid/active on this property for
  // the requested window (daily) or at all (monthly/sale). Advisory
  // (re-checked at accept + payment-confirm time).
  const { data: existing } = await sb
    .from('bookings')
    .select('id, period, start_date, end_date, status')
    .eq('property_id', prop.id)
    .in('status', ['paid', 'active']);
  const endStr = body.period === 'day' ? body.end_date! : null;
  const isExclusive = (p: string) => p === 'month' || p === 'sale';
  const overlaps = (existing ?? []).some((b) => {
    // An active monthly lease or a completed sale blocks everything, and a
    // monthly/sale request is blocked by any other paid/active booking.
    if (isExclusive(b.period) || isExclusive(body.period)) return true;
    return b.start_date < endStr! && body.start_date < (b.end_date as string);
  });
  if (overlaps) {
    throwApi('DATES_UNAVAILABLE', 409,
      body.period === 'sale' ? 'Ce bien n\'est plus disponible.' : 'Ces dates ne sont plus disponibles.');
  }

  // Money snapshot — buyer pays the 3% fee on top. Daily: rent × nights.
  // Monthly: 1st month + a 1-month CAUTION (deposit) held in escrow (client
  // 2026-07-29). The landlord receives 1st month + caution at move-in; the
  // end-of-lease return of the caution is settled off-app between the parties
  // (like the following months). Sale: the full price, once, no deposit — the
  // property doesn't get "returned" the way a caution does. Fee model
  // verified 2026-06-10.
  const rent = Number(prop.price_minor);
  const deposit = body.period === 'month' ? rent : 0;
  const amount = body.period === 'day' ? rent * nights : body.period === 'month' ? rent + deposit : rent;
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
    deposit_minor: deposit,
    amount_minor: amount,
    fees_minor: fees,
    total_minor: total,
    clauses: body.period === 'sale'
      ? [
          "L'acheteur verse via Linky le montant indiqué ; les fonds sont conservés en séquestre jusqu'à la confirmation de la remise du bien.",
          "À la remise du bien, l'acheteur confirme la réception dans l'application et le montant est versé au vendeur.",
          'Le transfert de propriété (acte notarié, titre foncier) se règle directement entre les parties, hors application.',
          'En cas de désaccord, les parties peuvent ouvrir un litige via Linky ; une médiation est proposée sous 48 heures.',
          'Le présent contrat est régi par le droit guinéen.',
        ]
      : [
          "Le locataire verse via Linky le montant indiqué ; les fonds sont conservés en séquestre jusqu'à la confirmation de l'emménagement.",
          "À la remise des clés, le locataire confirme l'emménagement dans l'application et le loyer est versé au propriétaire.",
          ...(body.period === 'month'
            ? [
                'Le montant à la signature comprend le premier mois de loyer et une caution équivalente à un mois de loyer.',
                'Les loyers des mois suivants et la restitution de la caution en fin de bail sont réglés directement entre les parties.',
              ]
            : ['Le présent contrat couvre la totalité du séjour indiqué.']),
          'En cas de désaccord, les parties peuvent ouvrir un litige via Linky ; une médiation est proposée sous 48 heures.',
          'Le présent contrat est régi par le droit guinéen.',
        ],
  };

  // Daily = INSTANT-BOOK (client 2026-07-29): the landlord's active daily
  // listing IS the acceptance, so the booking is created already 'accepted' +
  // landlord-signed and the tenant pays immediately (no accept step). Monthly
  // and sale both still start 'requested' — the owner accepts/refuses via
  // booking-respond before the buyer pays. A sale is too significant to
  // auto-accept the way a cheap daily stay does.
  const instant = body.period === 'day';
  const nowIso = new Date().toISOString();

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
      status: instant ? 'accepted' : 'requested',
      landlord_signed_at: instant ? nowIso : null,
      events: [{
        at: nowIso,
        label: instant
          ? 'Réservation confirmée — en attente du paiement'
          : body.period === 'sale' ? 'Demande d\'achat envoyée' : 'Demande de réservation envoyée',
      }],
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
    title: instant
      ? 'Nouvelle réservation'
      : body.period === 'sale' ? 'Nouvelle demande d\'achat' : 'Nouvelle demande de réservation',
    body: instant
      ? `${tenantName} a réservé « ${prop.title} » (${formatGNF(total)}) — paiement en cours.`
      : body.period === 'sale'
        ? `${tenantName} veut acheter « ${prop.title} » (${formatGNF(total)}).`
        : `${tenantName} veut louer « ${prop.title} » (${formatGNF(total)}).`,
    iconHint: 'check',
    deeplink: `/agent/leases/${created.id}`,
    refType: 'booking',
    refId: created.id,
    app: 'marketplace',
  });

  // instant (daily) → the client routes straight to the booking to pay;
  // monthly → it lands on the list and waits for the landlord.
  return { body: { booking_id: created.id, instant } };
}));
