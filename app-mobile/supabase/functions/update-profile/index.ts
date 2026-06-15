// Phase T.1 — single endpoint that fixes BOTH the onboarding data-loss
// (display_name + city collected in profile-setup and previously discarded)
// AND role management (toggling buyer / seller / agent from the "Mes rôles"
// screen, including the "Devenir vendeur" upgrade path from the Home pitch).
//
// Body shape is open — every field is optional. The server applies whichever
// subset the client sends ; absent fields are not touched. Returns the
// fresh user payload in the same shape the auth fns return (id, display_name,
// avatar_url, locale, kyc_status, city, roles, is_admin) so the client can
// rehydrate the auth store from one round-trip.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body {
  display_name?: string;
  city?: string;
  roles?: string[];
  // Public URL of an image already uploaded to the `avatars` bucket via
  // /photo-upload-url. Empty string clears the avatar. The handler enforces it
  // points at OUR storage so a client can't set an arbitrary external URL.
  avatar_url?: string;
}

const V1_ROLES = new Set(['buyer', 'seller', 'agent']);

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (x.display_name !== undefined) {
    if (typeof x.display_name !== 'string') return false;
    const trimmed = x.display_name.trim();
    if (trimmed.length < 1 || trimmed.length > 60) return false;
  }
  if (x.city !== undefined) {
    if (typeof x.city !== 'string') return false;
    const trimmed = x.city.trim();
    // ≤40 per spec ; empty string is allowed and means "clear the city".
    if (trimmed.length > 40) return false;
  }
  if (x.avatar_url !== undefined) {
    if (typeof x.avatar_url !== 'string') return false;
    if (x.avatar_url.length > 500) return false;
  }
  if (x.roles !== undefined) {
    if (!Array.isArray(x.roles)) return false;
    if (x.roles.length < 1 || x.roles.length > 3) return false;
    for (const r of x.roles) {
      if (typeof r !== 'string' || !V1_ROLES.has(r)) return false;
    }
  }
  // At least one updatable field must be present — otherwise this is a no-op
  // that wastes an idempotency key.
  if (
    x.display_name === undefined &&
    x.city === undefined &&
    x.roles === undefined &&
    x.avatar_url === undefined
  ) {
    return false;
  }
  return true;
}

Deno.serve(makePost<Body>('/v1/profile/update', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const patch: Record<string, unknown> = {};
  if (body.display_name !== undefined) {
    patch.display_name = body.display_name.trim();
  }
  if (body.city !== undefined) {
    const trimmed = body.city.trim();
    patch.city = trimmed.length === 0 ? null : trimmed;
  }
  if (body.avatar_url !== undefined) {
    const v = body.avatar_url.trim();
    if (v.length === 0) {
      patch.avatar_url = null; // clear
    } else {
      // Must be a public URL inside OUR avatars bucket — blocks setting an
      // arbitrary external/attacker URL as a profile image.
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      if (!supabaseUrl) throwApi('INTERNAL_ERROR', 500, 'Configuration manquante');
      const prefix = `${supabaseUrl}/storage/v1/object/public/avatars/`;
      if (!v.startsWith(prefix)) throwApi('INVALID_BODY', 400, 'Avatar invalide');
      patch.avatar_url = v;
    }
  }
  if (body.roles !== undefined) {
    // De-dupe + sort for stable storage. The CHECK constraint enforces the
    // V1 set + non-empty independently ; this is presentational.
    const deduped = Array.from(new Set(body.roles)).sort();
    patch.roles = deduped;
  }

  const { error: eUpd } = await sb
    .from('users')
    .update(patch)
    .eq('id', userId);
  if (eUpd) {
    // Check-constraint violation surfaces as 23514 — bubble up as validation.
    if (eUpd.code === '23514') {
      throwApi('INVALID_BODY', 400, 'Profil invalide');
    }
    console.error('[update-profile] update error:', eUpd);
    throwApi('INTERNAL_ERROR', 500, 'Erreur mise à jour du profil');
  }

  const { data: user, error: eSel } = await sb
    .from('users')
    .select('id, display_name, avatar_url, locale, kyc_status, city, roles, is_admin')
    .eq('id', userId)
    .single();
  if (eSel || !user) {
    console.error('[update-profile] select error:', eSel);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lecture profil');
  }

  return { body: { user } };
}));
