// Property owner (agent) decides on a pending visit request — accept or reject.
// JWT-authed. Two guards: (1) the caller must own the property the visit_request
// targets — verified server-side via join, never trusted from the client; (2) the
// row must still be in 'pending' state. The UPDATE re-asserts status='pending' in
// its WHERE so a double-tap race can't flip the row twice.
//
// Note column on visit_requests holds the BUYER's original note. The agent's
// response note is not persisted in this iteration (would need either a separate
// agent_note column or a notes array — flagged as follow-up).
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { notifyDetached } from '@shared/push.ts';

interface Body {
  visit_request_id: string;
  decision: 'accept' | 'reject';
  note?: string;
}

function isUuid(s: unknown): s is string {
  return typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (!isUuid(x.visit_request_id)) return false;
  if (x.decision !== 'accept' && x.decision !== 'reject') return false;
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
  decided_at: string | null;
  decided_by_id: string | null;
  created_at: string;
}

function mapVisit(r: VisitRow) {
  return {
    id: r.id,
    propertyId: r.property_id,
    buyerId: r.buyer_id,
    requestedAt: r.requested_at,
    note: r.note,
    status: r.status,
    decidedAt: r.decided_at ?? undefined,
    decidedById: r.decided_by_id ?? undefined,
    createdAt: r.created_at,
  };
}

// Guinea is UTC+0, so server-side UTC formatting matches local wall time.
function formatSlot(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  return `${date} à ${time}`;
}

Deno.serve(makePost<Body>('/v1/visits/respond', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  // 1. Load the visit + owning property for authorization + status guard.
  // title feeds the O.3 push to the buyer.
  const { data: visit, error: loadErr } = await sb
    .from('visit_requests')
    .select('id, status, property_id, properties!inner ( owner_id, title )')
    .eq('id', body.visit_request_id)
    .maybeSingle();

  if (loadErr) {
    console.error('[visit-respond] load error:', loadErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  if (!visit) throwApi('VISIT_NOT_FOUND', 404, 'Demande introuvable.');

  const ownerId = (visit as { properties: { owner_id: string } | null }).properties?.owner_id;
  if (ownerId !== userId) throwApi('FORBIDDEN', 403, 'Action non autorisée.');

  if ((visit as { status: string }).status !== 'pending') {
    throwApi('INVALID_STATUS', 400, 'Cette demande a déjà été traitée.');
  }

  const nextStatus = body.decision === 'accept' ? 'accepted' : 'rejected';
  const nowIso = new Date().toISOString();

  // Atomic update under the (status='pending') guard — defense against
  // concurrent double-tap. If the row isn't pending anymore the update returns 0
  // rows and we surface a clean 409.
  const { data: updated, error: upErr } = await sb
    .from('visit_requests')
    .update({
      status: nextStatus,
      decided_at: nowIso,
      decided_by_id: userId,
      updated_at: nowIso,
    })
    .eq('id', body.visit_request_id)
    .eq('status', 'pending')
    .select('id, property_id, buyer_id, requested_at, note, status, decided_at, decided_by_id, created_at')
    .maybeSingle();

  if (upErr) {
    console.error('[visit-respond] update error:', upErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur mise à jour demande');
  }
  if (!updated) {
    throwApi('INVALID_STATUS', 409, "Cette demande vient d'être mise à jour.");
  }

  const updatedRow = updated as VisitRow;
  const propertyTitle =
    (visit as { properties: { title: string | null } | null }).properties?.title ?? 'le bien';
  const slot = formatSlot(updatedRow.requested_at);
  notifyDetached(sb, {
    userIds: [updatedRow.buyer_id],
    category: 'visit',
    title: body.decision === 'accept' ? 'Visite acceptée' : 'Visite refusée',
    body:
      body.decision === 'accept'
        ? `Ta visite de ${propertyTitle} le ${slot} est confirmée.`
        : `Ta demande de visite de ${propertyTitle} le ${slot} n'a pas été retenue.`,
    iconHint: 'check',
    // Buyer-side visit list lands in V1.1 (buyer/requests is an empty-state
    // stub) — route to the property the visit concerns instead.
    deeplink: `/property/${updatedRow.property_id}`,
    refType: 'visit_request',
    refId: updatedRow.id,
  });

  return { body: { visit_request: mapVisit(updatedRow) } };
}));
