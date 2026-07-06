// Owner marks an ACCEPTED visit as COMPLETED (the visit actually happened).
// This is the missing writer of visit_requests.status='completed' — required
// by the client rule "visite obligatoire avant toute transaction (achat/vente)":
// any future on-app sale transaction must check for a completed visit row.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { notifyDetached } from '@shared/push.ts';

interface Body { visit_request_id: string }

const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  return typeof x.visit_request_id === 'string' && UUID_RE.test(x.visit_request_id);
}

Deno.serve(makePost<Body>('/v1/visits/complete', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const { data: visit, error: eV } = await sb
    .from('visit_requests')
    .select('id, status, buyer_id, requested_at, property:properties!inner(id, owner_id, title)')
    .eq('id', body.visit_request_id)
    .maybeSingle();
  if (eV) { console.error('[visit-complete] lookup:', eV); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
  if (!visit) throwApi('VISIT_NOT_FOUND', 404, 'Visite introuvable.');
  const prop = visit.property as unknown as { id: string; owner_id: string; title: string };
  if (prop.owner_id !== userId) throwApi('FORBIDDEN', 403, 'Action refusée.');
  if (visit.status !== 'accepted') {
    throwApi('INVALID_STATUS', 409, 'Seule une visite confirmée peut être marquée comme effectuée.');
  }

  const { data: updated, error: eUp } = await sb
    .from('visit_requests')
    .update({ status: 'completed', decided_at: new Date().toISOString(), decided_by_id: userId })
    .eq('id', visit.id)
    .eq('status', 'accepted') // double-tap safety
    .select('id')
    .maybeSingle();
  if (eUp) { console.error('[visit-complete] update:', eUp); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
  if (!updated) throwApi('INVALID_STATUS', 409, 'Cette visite a déjà changé d\'état.');

  notifyDetached(sb, {
    userIds: [visit.buyer_id as string],
    category: 'visit',
    title: 'Visite effectuée',
    body: `Ta visite pour « ${prop.title} » est confirmée comme effectuée.`,
    iconHint: 'check',
    deeplink: '/buyer/requests',
    refType: 'visit_request',
    refId: visit.id,
  });

  return { body: { ok: true } };
}));
