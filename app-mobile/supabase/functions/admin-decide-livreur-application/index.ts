// Phase LIVREUR ONBOARDING — admin accept/reject a courier application.
// Admin-only (requireUser + assertAdmin). The status transition + the
// 'livreur' role grant are applied ATOMICALLY in decide_livreur_application
// (so an approve can never flip the row without granting the role, or vice
// versa). The admin_actions audit row is appended here (Phase K convention).
//
// Body : { application_id, decision: 'approve'|'reject', reject_reason? }
//   approve → status='approved' + 'livreur' appended to users.roles
//   reject  → status='rejected' + reject_reason (required)
// Only PENDING applications can be decided (RPC enforces).
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';

const UUID_RE = /^[0-9a-f-]{36}$/i;

interface Body {
  application_id: string;
  decision: 'approve' | 'reject';
  reject_reason?: string;
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.application_id !== 'string' || !UUID_RE.test(x.application_id)) return false;
  if (x.decision !== 'approve' && x.decision !== 'reject') return false;
  if (x.reject_reason !== undefined && (typeof x.reject_reason !== 'string' || x.reject_reason.length > 500)) return false;
  return true;
}

interface AppJson {
  id: string;
  user_id: string;
  full_name: string;
  city: string;
  vehicle_type: string;
  id_photo_url: string | null;
  answers: Record<string, unknown>;
  status: string;
  reject_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

Deno.serve(makePost<Body>('/v1/admin/livreur/applications/decide', valid, async ({ sb, body, req }) => {
  const adminId = await requireUser(req);
  await assertAdmin(sb, adminId);

  const reason = body.reject_reason?.trim();
  if (body.decision === 'reject' && (!reason || reason.length === 0)) {
    throwApi('REASON_REQUIRED', 400, 'Un motif est requis pour refuser une candidature.');
  }

  const { data, error } = await sb.rpc('decide_livreur_application', {
    p_application_id: body.application_id,
    p_decision: body.decision,
    p_reason: body.decision === 'reject' ? reason : null,
    p_admin_id: adminId,
  });
  if (error) {
    const msg = (error as { message?: string } | null)?.message ?? '';
    console.error('[admin-decide-livreur-application] rpc error:', error);
    if (msg.includes('APPLICATION_NOT_FOUND'))   throwApi('APPLICATION_NOT_FOUND',   404, 'Candidature introuvable.');
    if (msg.includes('APPLICATION_NOT_PENDING')) throwApi('APPLICATION_NOT_PENDING', 409, 'Cette candidature est déjà tranchée.');
    if (msg.includes('INVALID_DECISION'))        throwApi('INVALID_DECISION',        400, 'Décision invalide.');
    throwApi('INTERNAL_ERROR', 500, 'Erreur décision candidature');
  }

  const app = data as AppJson;

  // Audit (Phase K convention). Best-effort: a failed audit insert must not
  // undo a decision that already moved the role.
  const { error: auditErr } = await sb.from('admin_actions').insert({
    admin_id: adminId,
    target_type: 'livreur_application',
    target_id: app.id,
    action: body.decision === 'approve' ? 'livreur.approve' : 'livreur.reject',
    reason: reason ?? null,
    before_snapshot: { status: 'pending' },
    after_snapshot: { status: app.status, granted_role: body.decision === 'approve' ? 'livreur' : null },
  });
  if (auditErr) console.error('[admin-decide-livreur-application] audit insert failed:', auditErr);

  const application = {
    id: app.id,
    userId: app.user_id,
    fullName: app.full_name,
    city: app.city,
    vehicleType: app.vehicle_type,
    idPhotoUrl: app.id_photo_url,
    answers: app.answers,
    status: app.status,
    rejectReason: app.reject_reason ?? undefined,
    reviewedBy: app.reviewed_by,
    reviewedAt: app.reviewed_at,
    createdAt: app.created_at,
  };

  return { body: { application } };
}));
