// Admin — suspend or reactivate a user (fraud / abuse handling).
//
// Body: { user_id, action: 'suspend' | 'reactivate', reason? }
//   suspend    → users.status='suspended' + revoke all the user's sessions so
//                they're locked out (otp-verify + session-refresh both refuse a
//                non-'active' account; the live access token dies within its
//                15-min TTL).
//   reactivate → users.status='active'.
// Guards: can't act on an admin, can't act on yourself, can't touch the system
// escrow/platform users. Audit row per decision.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';

interface Body { user_id: string; action: 'suspend' | 'reactivate'; reason?: string }

const UUID_RE = /^[0-9a-f-]{36}$/i;
const SYSTEM_IDS = new Set([
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
]);

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.user_id !== 'string' || !UUID_RE.test(x.user_id)) return false;
  if (x.action !== 'suspend' && x.action !== 'reactivate') return false;
  if (x.reason !== undefined && (typeof x.reason !== 'string' || x.reason.length > 500)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/admin/users/set-status', valid, async ({ sb, body, req }) => {
  const adminId = await requireUser(req);
  await assertAdmin(sb, adminId);

  if (body.user_id === adminId) throwApi('SELF_ACTION', 400, 'Tu ne peux pas te suspendre toi-même.');
  if (SYSTEM_IDS.has(body.user_id)) throwApi('FORBIDDEN', 403, 'Compte système protégé.');

  const { data: target, error: eT } = await sb
    .from('users')
    .select('id, status, is_admin, display_name')
    .eq('id', body.user_id)
    .maybeSingle();
  if (eT) { console.error('[admin-set-user-status] lookup:', eT); throwApi('INTERNAL_ERROR', 500, 'Erreur base de données'); }
  if (!target) throwApi('USER_NOT_FOUND', 404, 'Utilisateur introuvable.');
  if ((target as { is_admin?: boolean }).is_admin) throwApi('FORBIDDEN', 403, 'Impossible de suspendre un administrateur.');
  if ((target as { status?: string }).status === 'deleted') throwApi('INVALID_STATUS', 409, 'Ce compte est supprimé.');

  const before = (target as { status?: string }).status ?? 'active';
  const next = body.action === 'suspend' ? 'suspended' : 'active';
  if (before === next) {
    throwApi('NO_CHANGE', 409, body.action === 'suspend' ? 'Ce compte est déjà suspendu.' : 'Ce compte est déjà actif.');
  }

  const { error: uErr } = await sb.from('users')
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq('id', body.user_id);
  if (uErr) { console.error('[admin-set-user-status] update:', uErr); throwApi('INTERNAL_ERROR', 500, 'Erreur mise à jour'); }

  // Immediate lockout on suspend: revoke every live session.
  if (body.action === 'suspend') {
    await sb.from('sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', body.user_id)
      .is('revoked_at', null);
  }

  const { error: auditErr } = await sb.from('admin_actions').insert({
    admin_id: adminId,
    target_type: 'user',
    target_id: body.user_id,
    action: body.action === 'suspend' ? 'user.suspend' : 'user.reactivate',
    reason: body.reason?.trim() || null,
    metadata: { display_name: (target as { display_name?: string }).display_name ?? null },
    before_snapshot: { status: before },
    after_snapshot: { status: next },
  });
  if (auditErr) console.error('[admin-set-user-status] audit insert failed:', auditErr);

  return { body: { ok: true, status: next } };
}));
