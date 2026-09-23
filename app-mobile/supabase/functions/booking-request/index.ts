// Tenant requests a rental booking (location par jour / par mois) OR a buyer
// requests to purchase a vente/terrain listing (period 'sale', 2026-08-31).
// Creates the booking at status 'requested' with a money + contract snapshot;
// the landlord/seller then accepts & signs (booking-respond), the tenant/buyer
// signs & pays (booking-sign-pay → cron-poll-intents → confirm_booking_payment).
// La visite en ligne a ete retiree le 2026-09-09 : aucune precondition de
// visite ne s'applique plus, ni pour une location ni pour un achat. Le
// rendez-vous physique se convient par le chat de l'application.
import { makePost } from '@shared/wrap.ts';
import { platformFee } from '@shared/fees.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { requireBuyerRole } from '@shared/roles.ts';
import { notifyDetached, displayNameOf, formatGNF } from '@shared/push.ts';
import { addMonthsClamped } from '@shared/dates.ts';

interface Body {
  property_id: string;
  period: 'day' | 'month' | 'sale';
  start_date: string;      // 'YYYY-MM-DD' — for 'sale', a formality (today), not a schedule
  end_date?: string;       // daily only, exclusive check-out
  months?: number;         // monthly only, 1..36
  note?: string;
  /** PROLONGATION d'un bail au mois en cours. Quand il est fourni, le serveur
   *  derive lui-meme start_date (la fin du bail parent) et ignore celui envoye :
   *  une prolongation ne commence QUE la ou le bail precedent s'arrete, et ce
   *  n'est pas negociable depuis le telephone. */
  extend_booking_id?: string;
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
  if (x.extend_booking_id !== undefined) {
    if (typeof x.extend_booking_id !== 'string' || !UUID_RE.test(x.extend_booking_id)) return false;
    // On ne prolonge qu'un bail au mois, par un bail au mois.
    if (x.period !== 'month') return false;
  }
  return true;
}

Deno.serve(makePost<Body>('/v1/bookings/request', valid, async ({ sb, body, req }) => {
  const tenantId = await requireUser(req);
  // VERROU « MODE ACHETEUR », cote serveur (client 2026-09-08 23:01). Place
  // juste apres l'authentification et AVANT toute ecriture : un refus tardif
  // laisserait derriere lui une commande, un lot ou une reservation a moitie
  // constitues. Voir _shared/roles.ts pour ce qu'il ne faut SURTOUT pas
  // verrouiller avec ce garde.
  await requireBuyerRole(sb, tenantId);

  const start = parseDate(body.start_date);
  if (!start) throwApi('INVALID_DATES', 400, 'Date de début invalide.');
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  // LES BORNES DE DATE SONT PLUS BAS, une fois la prolongation resolue. Elles
  // portaient ici sur body.start_date — celle que le serveur IGNORE quand il
  // s'agit d'une prolongation, puisqu'il la recalcule. Avec la duree par defaut
  // du selecteur (12 mois), la reprise tombe a ~365 jours et le plafond de
  // 6 mois la refusait systematiquement : le bouton « Prolonger » livre au
  // client n'aurait jamais abouti sur un bail de plus de six mois, avec en prime
  // un message parlant d'une date que le locataire n'a jamais choisie.

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
  // ── PROLONGATION : LE LOCATAIRE EN PLACE REPREND SON PROPRE BAIL ─────────
  // Demande du client (2026-09-18) : « quand le statut de la reservation est en
  // "Actives", rajouter un bouton "Prolonger" qui renvoie vers le calendrier de
  // reservation ». Livree le jour meme pour les locations a la journee ; cote
  // mensuel elle butait sur les gardes ci-dessous, ecrites — a juste titre —
  // pour empecher deux locataires de payer le meme logement.
  //
  // Le seul cas qu'elles ne doivent pas bloquer est celui-ci. On le valide donc
  // strictement, puis on exclut UNE ligne : le bail parent. Tout le reste
  // continue de bloquer.
  let parentLease:
    | { id: string; start_date: string; months: number; status: string; rent_minor: number }
    | null = null;
  if (body.extend_booking_id) {
    const { data: parent, error: eParent } = await sb
      .from('bookings')
      .select('id, tenant_id, property_id, period, status, start_date, months, rent_minor, extends_booking_id')
      .eq('id', body.extend_booking_id)
      .maybeSingle();
    if (eParent) { console.error('[booking-request] parent lookup:', eParent); throwApi('INTERNAL_ERROR', 500, 'Erreur base de donnees'); }
    if (!parent) throwApi('BOOKING_NOT_FOUND', 404, 'Le bail a prolonger est introuvable.');
    if (parent.tenant_id !== tenantId) throwApi('FORBIDDEN', 403, 'Action refusee.');
    if (parent.property_id !== prop.id) throwApi('EXTEND_MISMATCH', 400, 'Ce bail ne porte pas sur cette annonce.');
    if (parent.period !== 'month') throwApi('EXTEND_MISMATCH', 400, 'Seul un bail au mois se prolonge.');
    // 'paid' (emmenagement pas encore confirme) ou 'active' (bail en cours) :
    // dans les deux cas le locataire tient le logement. Ni 'completed' — il
    // faut alors une demande neuve, le bien etant redevenu libre — ni les
    // statuts morts.
    if (parent.status !== 'paid' && parent.status !== 'active') {
      throwApi('EXTEND_NOT_ACTIVE', 409, "Ce bail n'est plus en cours : fais une nouvelle demande.");
    }
    if (!parent.months) throwApi('EXTEND_MISMATCH', 400, "Ce bail n'a pas de duree.");
    parentLease = {
      id: parent.id as string,
      start_date: parent.start_date as string,
      months: parent.months as number,
      status: parent.status as string,
      rent_minor: Number(parent.rent_minor),
    };
  }

  // La date retenue : derivee pour une prolongation, choisie sinon.
  const startStr = parentLease
    ? addMonthsClamped(parentLease.start_date, parentLease.months)
    : body.start_date;
  const startAt = new Date(`${startStr}T00:00:00Z`).getTime();

  if (startAt < today.getTime()) {
    // Un bail reste 'paid' pour toujours si le locataire ne confirme jamais son
    // emmenagement (complete_ended_bookings ne touche que les 'active') : sa
    // reprise est alors dans le passe. Le dire franchement vaut mieux que
    // « la date de debut est deja passee », que rien a l'ecran ne permet de
    // corriger puisque la date y est verrouillee.
    throwApi(parentLease ? 'EXTEND_TERM_PASSED' : 'INVALID_DATES', 400,
      parentLease
        ? "Ce bail est arrivé à son terme : il ne peut plus être prolongé. Contacte le propriétaire."
        : 'La date de début est déjà passée.');
  }
  // Le plafond de 6 mois protege un choix LIBRE de l'utilisateur. Il n'a aucun
  // sens sur une date que le serveur calcule lui-meme a partir d'un bail deja
  // signe — et il rendait la prolongation impossible sur tout bail de plus de
  // six mois, c'est-a-dire le cas courant.
  if (!parentLease && startAt > today.getTime() + 180 * 86_400_000) {
    throwApi('INVALID_DATES', 400, 'La date de début est trop éloignée (6 mois max).');
  }

  // Un bien 'reserved' l'est PAR le bail que l'on prolonge : ce n'est pas une
  // indisponibilite pour son propre locataire.
  if (prop.status !== 'active' && !(parentLease && prop.status === 'reserved')) {
    throwApi('PROPERTY_INACTIVE', 409, 'Cette annonce n\'est plus disponible.');
  }
  if (prop.owner_id === tenantId) throwApi('SELF_BOOKING_FORBIDDEN', 400, 'Tu ne peux pas réserver ton propre bien.');

  // LA VISITE EN LIGNE A ETE RETIREE le 2026-09-09 (client : « On peut retirer
  // completement tout ce qui est visite. Ils vont utiliser le chat in app pour
  // se fixer un rdv pour la visite physique »).
  //
  // CONSEQUENCE DIRECTE : la precondition VISIT_REQUIRED qui bloquait l'achat
  // d'un bien tombe avec elle. Elle exigeait une ligne visit_requests en
  // 'completed' ; plus aucun ecran ne permet d'en creer une, donc la garder
  // aurait rendu « Acheter via l'application » definitivement impossible — un
  // bouton qui echoue a chaque fois, avec un message renvoyant a une
  // fonctionnalite disparue. Le rendez-vous physique se cale desormais par le
  // chat, hors machine a etats.
  if (body.period !== 'sale') {
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
    .select('id, period, start_date, end_date, status, tenant_id, extends_booking_id')
    .eq('property_id', prop.id)
    // 'disputed' compte comme occupe : un sejour gele par un litige tient
    //  toujours les nuits, et son argent dort en sequestre.
    .in('status', ['paid', 'active', 'disputed']);
  // LA CHAINE, PAS LA SEULE LIGNE PARENTE. Un locataire qui prolonge deux fois
  // a trois reservations sur le bien : le bail d'origine, la premiere
  // prolongation, la seconde. N'exclure que le parent DIRECT laissait le bail
  // d'origine — toujours exclusif — refuser la deuxieme prolongation avec
  // « ces dates ne sont plus disponibles », sur un logement que le demandeur
  // occupe. On remonte donc les liens extends_booking_id depuis le parent.
  const chain = new Set<string>();
  if (parentLease) {
    const byId = new Map((existing ?? []).map((b) => [b.id as string, b]));
    let cursor: string | null = parentLease.id;
    // Borne de securite : une boucle de liens corrompue ne doit pas tourner
    // indefiniment dans une fonction edge.
    for (let hops = 0; cursor && hops < 40; hops++) {
      chain.add(cursor);
      const row = byId.get(cursor);
      cursor = row ? ((row.extends_booking_id as string | null) ?? null) : null;
    }
  }

  const endStr = body.period === 'day' ? body.end_date! : null;
  const isExclusive = (p: string) => p === 'month' || p === 'sale';
  const overlaps = (existing ?? []).some((b) => {
    // Les baux de la chaine que l'on prolonge n'entrent pas en conflit avec
    // elle-meme — a condition qu'ils appartiennent bien au demandeur.
    if (chain.has(b.id as string) && b.tenant_id === tenantId) return false;
    // An active monthly lease or a completed sale blocks everything, and a
    // monthly/sale request is blocked by any other paid/active booking.
    if (isExclusive(b.period) || isExclusive(body.period)) return true;
    return b.start_date < endStr! && startStr < (b.end_date as string);
  });
  if (overlaps) {
    throwApi('DATES_UNAVAILABLE', 409,
      body.period === 'sale' ? 'Ce bien n\'est plus disponible.' : 'Ces dates ne sont plus disponibles.');
  }

  // Money snapshot — buyer pays the platform fee on top (taux dans
  // _shared/fees.ts ; 3 % jusqu'au 2026-09-08, 5 % depuis). Daily: rent × nights.
  // Monthly: 1st month + a 1-month CAUTION (deposit) held in escrow (client
  // 2026-07-29). The landlord receives 1st month + caution at move-in; the
  // end-of-lease return of the caution is settled off-app between the parties
  // (like the following months). Sale: the full price, once, no deposit — the
  // property doesn't get "returned" the way a caution does. Fee model
  // verified 2026-06-10.
  // LE LOYER D'UNE PROLONGATION EST CELUI DU BAIL QU'ELLE RECONDUIT. La clause
  // signee dit « aux memes conditions » : prendre le prix courant de l'annonce
  // aurait fait mentir le document des que le proprietaire edite son prix
  // pendant que son locataire est en place — dans un sens comme dans l'autre.
  const rent = parentLease ? parentLease.rent_minor : Number(prop.price_minor);
  // PAS DE SECONDE CAUTION SUR UNE PROLONGATION. La caution du bail initial
  // est deja partie chez le proprietaire (versee a l'emmenagement) et sa
  // restitution se regle hors application, en fin de bail. La reclamer une
  // deuxieme fois ferait payer au locataire deux cautions pour un logement
  // qu'il n'a jamais quitte, sans en avoir recupere la premiere. Le client
  // n'avait pas distingue ce cas en demandant le bouton ; c'est la seule
  // decision prise ici qu'il n'a pas ecrite.
  // LA DISPENSE NE VAUT QUE SI LA CAUTION EST DEJA PARTIE. Elle l'est quand le
  // bail parent est 'active' : release_booking a verse loyer + caution au
  // proprietaire a l'emmenagement. Tant qu'il est seulement 'paid', l'argent
  // dort encore en sequestre et reste INTEGRALEMENT remboursable — le locataire
  // pouvait prolonger sans caution, puis annuler le bail parent dans sa fenetre
  // de 48 h et recuperer la caution : un bail de douze mois sans aucun depot,
  // alors que le contrat qu'il venait de signer affirmait le contraire.
  const depositAlreadyHeld = !!parentLease && parentLease.status === 'active';
  const deposit = body.period === 'month' && !depositAlreadyHeld ? rent : 0;
  const amount = body.period === 'day' ? rent * nights : body.period === 'month' ? rent + deposit : rent;
  const fees = platformFee(amount);
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
    start_date: startStr,
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
            ? depositAlreadyHeld
              ? [
                  'Cette prolongation reconduit le bail en cours à compter de son terme, aux mêmes conditions.',
                  "Le montant à la signature correspond à un mois de loyer. Aucune nouvelle caution n'est demandée : celle du bail initial reste acquise jusqu'à la fin de la location.",
                  'Les loyers des mois suivants et la restitution de la caution en fin de bail sont réglés directement entre les parties.',
                ]
              : [
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
      start_date: startStr,
      end_date: endStr,
      months: body.period === 'month' ? body.months : null,
      extends_booking_id: parentLease ? parentLease.id : null,
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
          : body.period === 'sale' ? 'Demande d\'achat envoyée'
            : parentLease ? 'Demande de prolongation envoyée'
            : 'Demande de réservation envoyée',
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
