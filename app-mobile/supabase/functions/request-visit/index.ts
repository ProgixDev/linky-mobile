// Buyer requests a visit on a property. JWT-authed; buyer_id = caller. Idempotent on
// (property_id, buyer_id, requested_at) — re-submitting the same slot returns the
// existing row rather than creating a duplicate or 409'ing. Future statuses
// (accepted/rejected/cancelled/completed) are managed by separate endpoints.
//
// Slot validity: requested_at must be strictly in the future and at most 60 days out.
// The property must exist and be active — paused/reserved/sold listings don't accept
// new visit requests.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { notifyDetached, displayNameOf } from '@shared/push.ts';

interface Body {
  property_id: string;
  requested_at: string;
  note?: string;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function isUuid(s: unknown): s is string {
  return typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (!isUuid(x.property_id)) return false;
  if (typeof x.requested_at !== 'string' || !ISO_RE.test(x.requested_at)) return false;
  if (x.note !== undefined && (typeof x.note !== 'string' || x.note.length > 500)) return false;
  return true;
}

interface VisitRow {
  id: string;
  property_id: string;
  buyer_id: string;
  requested_at: string;
  note: string;
  status: string;
  created_at: string;
}

function mapVisitRequest(r: VisitRow) {
  return {
    id: r.id,
    propertyId: r.property_id,
    buyerId: r.buyer_id,
    requestedAt: r.requested_at,
    note: r.note,
    status: r.status,
    createdAt: r.created_at,
  };
}

const SIXTY_DAYS_MS = 60 * 24 * 3600 * 1000;

Deno.serve(makePost<Body>('/v1/visits/request', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  // Slot timing: strictly future, within 60 days.
  const reqMs = Date.parse(body.requested_at);
  if (Number.isNaN(reqMs)) throwApi('INVALID_BODY', 400, 'Date invalide');
  const now = Date.now();
  if (reqMs <= now) throwApi('VISIT_TIME_PAST', 400, 'Date dans le passé');
  if (reqMs > now + SIXTY_DAYS_MS) throwApi('VISIT_TIME_FAR', 400, 'Date trop éloignée (max 60 jours)');

  // Property must exist and be active. owner_id + title feed the O.3 push.
  const { data: prop, error: ePropCheck } = await sb
    .from('properties').select('id, status, owner_id, title').eq('id', body.property_id).maybeSingle();
  if (ePropCheck) throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  if (!prop) throwApi('PROPERTY_NOT_FOUND', 404, 'Annonce introuvable.');
  if ((prop as { status: string }).status !== 'active') {
    throwApi('PROPERTY_INACTIVE', 400, "Cette annonce n'est plus disponible.");
  }

  // Insert; idempotent on (property_id, buyer_id, requested_at). On duplicate, fetch
  // the existing row and return it unchanged.
  const insertPayload = {
    property_id: body.property_id,
    buyer_id: userId,
    requested_at: body.requested_at,
    note: body.note?.trim() ?? '',
    status: 'pending',
  };
  const { data: created, error: insErr } = await sb
    .from('visit_requests').insert(insertPayload)
    .select('id, property_id, buyer_id, requested_at, note, status, created_at')
    .single();

  if (insErr) {
    if (insErr.code === '23505') {
      const { data: existing, error: fetchErr } = await sb
        .from('visit_requests')
        .select('id, property_id, buyer_id, requested_at, note, status, created_at')
        .eq('property_id', body.property_id)
        .eq('buyer_id', userId)
        .eq('requested_at', body.requested_at)
        .maybeSingle();
      if (fetchErr || !existing) {
        console.error('[request-visit] fetch-after-conflict error:', fetchErr);
        throwApi('INTERNAL_ERROR', 500, 'Erreur lecture demande');
      }
      return { body: { visit_request: mapVisitRequest(existing as VisitRow) } };
    }
    console.error('[request-visit] insert error:', insErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur création demande');
  }

  // Fresh insert only — the idempotent duplicate path above returns earlier
  // without re-notifying the owner.
  const { owner_id: ownerId, title } = prop as { owner_id: string; title: string };
  const createdRow = created as VisitRow;
  const buyerName = await displayNameOf(sb, userId);
  notifyDetached(sb, {
    userIds: [ownerId],
    category: 'visit',
    title: 'Nouvelle demande de visite',
    body: `${buyerName} veut visiter ${title}.`,
    iconHint: 'check',
    deeplink: `/pro/visites/${createdRow.id}`,
    refType: 'visit_request',
    refId: createdRow.id,
  });

  return { body: { visit_request: mapVisitRequest(createdRow) } };
}));
