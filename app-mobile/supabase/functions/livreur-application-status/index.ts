// Phase LIVREUR ONBOARDING — courier polls their own application status.
// Authed (requireUser → caller). Drives the driver-app gate: 'none' shows the
// apply form, 'pending' a waiting screen, 'approved' unlocks the space,
// 'rejected' shows the reason + a re-apply CTA.
//
// If the user already has the 'livreur' role, the answer is 'approved'
// regardless of any application row (the role is the source of truth — it can
// be granted outside an application, e.g. via update-profile / "Mes rôles").
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

// Empty-body endpoint — POST + idempotency-key to match the Linky API surface.
type Body = Record<string, unknown>;
function valid(b: unknown): b is Body {
  return typeof b === 'object' && b !== null;
}

Deno.serve(makePost<Body>('/v1/livreur/application-status', valid, async ({ sb, req }) => {
  const userId = await requireUser(req);

  const { data: user, error: userErr } = await sb
    .from('users')
    .select('roles, is_online')
    .eq('id', userId)
    .maybeSingle();
  if (userErr) {
    console.error('[livreur-application-status] user read error:', userErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  const { data: app, error: appErr } = await sb
    .from('livreur_applications')
    .select('id, user_id, full_name, city, vehicle_type, id_photo_url, answers, status, reject_reason, reviewed_by, reviewed_at, created_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (appErr) {
    console.error('[livreur-application-status] application read error:', appErr);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  const hasRole = !!user && Array.isArray(user.roles) && (user.roles as string[]).includes('livreur');
  if (hasRole) {
    const isOnline = (user as { is_online?: boolean }).is_online ?? false;
    return { body: { status: 'approved', application: app ?? null, is_online: isOnline } };
  }

  if (!app) {
    return { body: { status: 'none' } };
  }

  return {
    body: {
      status: app.status,
      reject_reason: app.status === 'rejected' ? app.reject_reason : undefined,
      application: app,
    },
  };
}));
