import { z } from 'zod';

/**
 * Driver profile — read snapshot (from the livreur application) + the editable
 * fields. Validation at the edge (network response + the form) is mandatory.
 */

export const VehicleTypeSchema = z.enum(['moto', 'voiture', 'velo', 'a_pied']);
export type VehicleType = z.infer<typeof VehicleTypeSchema>;

export const VEHICLE_LABELS: Record<VehicleType, string> = {
  moto: 'Moto',
  voiture: 'Voiture',
  velo: 'Vélo',
  a_pied: 'À pied',
};

/** The profile view model the screen renders. */
export const ProfileViewSchema = z.object({
  fullName: z.string(),
  city: z.string(),
  vehicleType: VehicleTypeSchema.nullable(),
  idPhotoUrl: z.string().nullable(),
  approved: z.boolean(),
});
export type ProfileView = z.infer<typeof ProfileViewSchema>;

/** The editable form payload (what a profile-update endpoint would take). */
export const ProfileEditSchema = z.object({
  full_name: z.string().trim().min(1, 'Ton nom complet est requis.'),
  city: z.string().trim().min(1, 'Ta ville de livraison est requise.'),
  vehicle_type: VehicleTypeSchema,
});
export type ProfileEdit = z.infer<typeof ProfileEditSchema>;

// --- Wire shape: the `livreur-application-status` response (reused read-only). ---
export const ProfileStatusWireSchema = z.object({
  status: z.enum(['none', 'pending', 'approved', 'rejected']),
  application: z
    .object({
      full_name: z.string().nullish(),
      city: z.string().nullish(),
      vehicle_type: z.string().nullish(),
      id_photo_url: z.string().nullish(),
    })
    .nullish(),
});
