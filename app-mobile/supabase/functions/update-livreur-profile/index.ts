// The courier edits their profile (nom / ville / moyen de transport) on the Profil
// screen. The profile READ comes from the livreur application (livreur-application-status),
// so the save updates that application — and mirrors display_name / city onto `users` so
// the canonical profile (shown in admin + on the buyer's delivery notifications) stays in
// sync. Authed (requireUser); the caller can only edit their OWN application.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

const VEHICLES = new Set(['moto', 'voiture', 'velo', 'a_pied']);

interface Body {
  full_name: string;
  city: string;
  vehicle_type: string;
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  if (typeof x.full_name !== 'string') return false;
  const name = x.full_name.trim();
  if (name.length < 1 || name.length > 60) return false;
  if (typeof x.city !== 'string') return false;
  const city = x.city.trim();
  if (city.length < 1 || city.length > 40) return false;
  if (typeof x.vehicle_type !== 'string' || !VEHICLES.has(x.vehicle_type)) return false;
  return true;
}

Deno.serve(makePost<Body>('/v1/livreur/profile/update', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);
  const full_name = body.full_name.trim();
  const city = body.city.trim();

  // The Profil screen reads name / city / vehicle from the livreur application — update it
  // so the edit is reflected on the next read. Scoped to the caller's own application.
  const { error: eApp } = await sb
    .from('livreur_applications')
    .update({ full_name, city, vehicle_type: body.vehicle_type })
    .eq('user_id', userId);
  if (eApp) {
    console.error('[update-livreur-profile] application update error:', eApp);
    throwApi('INTERNAL_ERROR', 500, 'Erreur mise à jour du profil');
  }

  // Mirror onto the canonical user profile (display_name is shown in admin + carried on
  // the buyer's delivery notifications). Non-fatal — the application is the source of truth.
  const { error: eUser } = await sb
    .from('users')
    .update({ display_name: full_name, city })
    .eq('id', userId);
  if (eUser) console.error('[update-livreur-profile] user sync error (non-fatal):', eUser);

  return { body: { ok: true } };
}));
