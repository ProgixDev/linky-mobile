// Final sprint §2 — admin listing moderation decision.
//
// Body : { kind: 'product' | 'property', id, action: 'approve' | 'takedown', reason? }
//   takedown → status 'removed' (admin-only value : the seller update fns
//              refuse edits on removed listings, so reinstatement goes
//              through 'approve' here) + push to the owner with the reason.
//   approve  → status 'active'. Allowed from pending / paused / removed only —
//              re-listing a sold or reserved item would resurrect inventory
//              that an order already consumed. No push (quiet approval).
// Audit : admin_actions row per decision (listing.approve / listing.takedown).
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';
import { notifyDetached } from '@shared/push.ts';

interface Body {
  kind: 'product' | 'property';
  id: string;
  action: 'approve' | 'takedown';
  reason?: string;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (x.kind !== 'product' && x.kind !== 'property') return false;
  if (typeof x.id !== 'string' || !UUID_RE.test(x.id)) return false;
  if (x.action !== 'approve' && x.action !== 'takedown') return false;
  if (x.reason !== undefined && (typeof x.reason !== 'string' || x.reason.length > 500)) return false;
  return true;
}

const APPROVABLE = new Set(['pending', 'paused', 'removed']);

Deno.serve(makePost<Body>('/v1/admin/listings/moderate', valid, async ({ sb, body, req }) => {
  const adminId = await requireUser(req);
  await assertAdmin(sb, adminId);

  const table = body.kind === 'product' ? 'products' : 'properties';
  const select = body.kind === 'product'
    ? 'id, title, status, shops!inner(owner_id)'
    : 'id, title, status, owner_id';

  const { data: row, error: readErr } = await sb.from(table).select(select).eq('id', body.id).maybeSingle();
  if (readErr) {
    console.error('[moderate-listing] read error:', readErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }
  if (!row) throwApi('LISTING_NOT_FOUND', 404, 'Annonce introuvable.');

  /* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST embed shapes */
  const r = row as any;
  const ownerId: string = body.kind === 'product'
    ? (Array.isArray(r.shops) ? r.shops[0]?.owner_id : r.shops?.owner_id)
    : r.owner_id;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const before = r.status as string;
  const title = r.title as string;

  let next: string;
  if (body.action === 'takedown') {
    if (before === 'removed') throwApi('ALREADY_REMOVED', 409, 'Cette annonce est déjà retirée.');
    next = 'removed';
  } else {
    if (before === 'active') throwApi('ALREADY_ACTIVE', 409, 'Cette annonce est déjà en ligne.');
    if (!APPROVABLE.has(before)) {
      throwApi('INVALID_STATUS', 409, `Impossible d'approuver une annonce « ${before} ».`);
    }
    next = 'active';
  }

  const { error: updErr } = await sb.from(table)
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq('id', body.id);
  if (updErr) {
    console.error('[moderate-listing] update error:', updErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur mise à jour');
  }

  const { error: auditErr } = await sb.from('admin_actions').insert({
    admin_id: adminId,
    target_type: body.kind,
    target_id: body.id,
    action: body.action === 'takedown' ? 'listing.takedown' : 'listing.approve',
    reason: body.reason?.trim() || null,
    metadata: { kind: body.kind, title },
    before_snapshot: { status: before },
    after_snapshot: { status: next },
  });
  if (auditErr) console.error('[moderate-listing] audit insert failed:', auditErr);

  if (body.action === 'takedown' && ownerId) {
    const reasonSuffix = body.reason?.trim() ? ` Motif : ${body.reason.trim()}` : '';
    notifyDetached(sb, {
      userIds: [ownerId],
      category: 'system',
      title: 'Annonce retirée',
      body: `Ton annonce « ${title} » a été retirée par la modération.${reasonSuffix}`,
      iconHint: 'shield',
    });
  }

  return { body: { ok: true, status: next } };
}));
