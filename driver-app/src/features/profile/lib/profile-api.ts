import { apiPost } from '@/shared/lib/api';

import {
  ProfileStatusWireSchema,
  VehicleTypeSchema,
  type ProfileEdit,
  type ProfileView,
} from '../model/schema';

export type ProfileResult = { ok: true; view: ProfileView } | { ok: false; message: string };

/**
 * Read the courier's profile snapshot. There is no dedicated profile-read endpoint
 * yet, so we reuse the authed `livreur-application-status` (it returns the courier's
 * own application: name / city / vehicle / photo) and the approval status. Validated
 * at this trust boundary.
 */
export async function fetchProfile(): Promise<ProfileResult> {
  try {
    const data = await apiPost<unknown>({ path: '/livreur-application-status' });
    const parsed = ProfileStatusWireSchema.safeParse(data);
    if (!parsed.success) return { ok: false, message: 'Profil indisponible pour le moment.' };
    const app = parsed.data.application;
    const vehicle = VehicleTypeSchema.safeParse(app?.vehicle_type);
    return {
      ok: true,
      view: {
        fullName: app?.full_name?.trim() || '',
        city: app?.city?.trim() || '',
        vehicleType: vehicle.success ? vehicle.data : null,
        idPhotoUrl: app?.id_photo_url ?? null,
        approved: parsed.data.status === 'approved',
      },
    };
  } catch {
    return { ok: false, message: 'Connexion impossible. Vérifie ta connexion.' };
  }
}

export type SaveResult = { ok: true } | { ok: false; message: string };

/**
 * Save the edited profile.
 *
 * STUB (exec-plan backend ask #3): there is NO livreur profile-update endpoint yet
 * (the marketplace has `update-profile`; the livreur equivalent is pending). The
 * form + Zod validation are fully wired, so the day the endpoint ships this becomes
 * a one-line `apiPost('/update-livreur-profile', input)`. Until then we surface an
 * honest "coming soon" instead of pretending the change persisted.
 */
export async function saveProfile(_input: ProfileEdit): Promise<SaveResult> {
  // TODO(backend ask #3): POST /update-livreur-profile { full_name, city, vehicle_type }.
  return { ok: false, message: 'La mise à jour du profil sera bientôt disponible.' };
}
