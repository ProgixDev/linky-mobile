import { ApiError, apiPost } from '@/shared/lib/api';

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
 * Save the edited profile via `update-livreur-profile` — it updates the livreur
 * application (the profile read source) and mirrors name / city onto `users`. The
 * store reloads the snapshot on success so the read-only view reflects the change.
 */
export async function saveProfile(input: ProfileEdit): Promise<SaveResult> {
  try {
    await apiPost<unknown>({ path: '/update-livreur-profile', body: input });
    return { ok: true };
  } catch (e) {
    const message = e instanceof ApiError ? e.message_fr : 'Mise à jour impossible. Réessaie.';
    return { ok: false, message };
  }
}
