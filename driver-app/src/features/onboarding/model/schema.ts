import { z } from 'zod';

/**
 * Livreur onboarding — application + questionnaire (French, "tu"). A courier who is not
 * yet an approved livreur registers here; an admin reviews it in the main Linky backend.
 * Everything entering the app (network responses, the form the user fills) is validated
 * at the edge — see docs/security/checklist.md SEC-INPUT-001.
 */

/** How the courier delivers. Wire values are fixed by the backend contract. */
export const VehicleTypeSchema = z.enum(['moto', 'voiture', 'velo', 'a_pied']);
export type VehicleType = z.infer<typeof VehicleTypeSchema>;

/** Where an application sits in the admin review pipeline. */
export const ApplicationStatusSchema = z.enum(['none', 'pending', 'approved', 'rejected']);
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;

/** The questionnaire answers (livraison / règles Guinée). */
export const ApplicationAnswersSchema = z.object({
  zones: z.string(),
  availability: z.string(),
  has_license_insurance: z.boolean(),
  accepts_qr_process: z.boolean(),
  accepts_linky_terms: z.boolean(),
});
export type ApplicationAnswers = z.infer<typeof ApplicationAnswersSchema>;

/**
 * The `livreur-apply` request body. The two « acceptes-tu » answers MUST be true — the
 * UI also disables submit until then, and the server enforces it (MUST_ACCEPT_TERMS).
 */
export const ApplicationInputSchema = z.object({
  full_name: z.string().trim().min(1, 'Ton nom complet est requis.'),
  city: z.string().trim().min(1, 'Ta ville de livraison est requise.'),
  vehicle_type: VehicleTypeSchema,
  id_photo_url: z.string().nullable().optional(),
  answers: ApplicationAnswersSchema.refine((a) => a.accepts_qr_process && a.accepts_linky_terms, {
    error: 'Tu dois accepter le processus QR et les conditions Linky.',
  }),
});
export type ApplicationInput = z.infer<typeof ApplicationInputSchema>;

// --- Wire responses (validated at the network edge) ---

/** `livreur-application-status` response. `application` is opaque to the gate. */
export const ApplicationStatusResponseSchema = z.object({
  status: ApplicationStatusSchema,
  reject_reason: z.string().nullish(),
  application: z.unknown().optional(),
});
export type ApplicationStatusResponse = z.infer<typeof ApplicationStatusResponseSchema>;

/** `livreur-apply` success payload. */
export const ApplyResponseSchema = z.object({ application: z.unknown().optional() });

/**
 * Closed set of failure kinds the onboarding API maps every backend code onto, so the UI
 * branches on a typed union (never a raw string). The server's French `message_fr` is
 * carried alongside for display.
 */
export type OnboardingErrorKind =
  | 'pending_exists' // APPLICATION_PENDING — a review is already in flight
  | 'already_livreur' // ALREADY_LIVREUR — the caller is already approved
  | 'must_accept' // MUST_ACCEPT_TERMS — the two « acceptes-tu » must be oui
  | 'invalid' // INVALID_BODY — server-side validation rejected the payload
  | 'offline' // transport failure — no connection
  | 'error'; // anything else — generic, no internal leak
