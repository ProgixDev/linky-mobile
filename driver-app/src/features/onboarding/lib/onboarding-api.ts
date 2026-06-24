import { ApiError, apiPost } from '@/shared/lib/api';

import {
  ApplicationStatusResponseSchema,
  ApplyResponseSchema,
  type ApplicationInput,
  type ApplicationStatus,
  type OnboardingErrorKind,
} from '../model/schema';

/**
 * Livreur onboarding client. Calls the live Linky edge functions
 * (`livreur-application-status`, `livreur-apply`) AUTHED — `apiPost` attaches the
 * self-rolled-JWT Bearer + an Idempotency-Key on the write. Every backend error code is
 * mapped to a closed {@link OnboardingErrorKind} union; the server's French `message_fr`
 * is surfaced for display. All responses are Zod-validated at this trust boundary.
 */

export type StatusResult =
  | {
      ok: true;
      status: ApplicationStatus;
      rejectReason: string | null;
      application: unknown;
    }
  | { ok: false; kind: OnboardingErrorKind; message: string };

export type SubmitResult =
  | { ok: true; application: unknown }
  | { ok: false; kind: OnboardingErrorKind; message: string };

const FALLBACK: Record<OnboardingErrorKind, string> = {
  pending_exists: 'Ta candidature est déjà en cours d’examen.',
  already_livreur: 'Tu es déjà livreur approuvé.',
  must_accept: 'Tu dois accepter le processus QR et les conditions Linky.',
  invalid: 'Vérifie les informations saisies.',
  offline: 'Connexion impossible. Vérifie ta connexion.',
  error: 'Une erreur est survenue. Réessaie.',
};

function kindForCode(status: number, code: string): OnboardingErrorKind {
  if (status === 0 || code === 'NETWORK_ERROR') return 'offline';
  switch (code) {
    case 'APPLICATION_PENDING':
      return 'pending_exists';
    case 'ALREADY_LIVREUR':
      return 'already_livreur';
    case 'MUST_ACCEPT_TERMS':
      return 'must_accept';
    case 'INVALID_BODY':
      return 'invalid';
    default:
      return 'error';
  }
}

function mapError(e: unknown): { kind: OnboardingErrorKind; message: string } {
  if (e instanceof ApiError) {
    const kind = kindForCode(e.status, e.code);
    return { kind, message: e.message_fr || FALLBACK[kind] };
  }
  return { kind: 'error', message: FALLBACK.error };
}

/** The approval gate: where does the signed-in courier's application stand? */
export async function fetchApplicationStatus(): Promise<StatusResult> {
  try {
    const data = await apiPost<unknown>({ path: '/livreur-application-status' });
    const parsed = ApplicationStatusResponseSchema.safeParse(data);
    if (!parsed.success) return { ok: false, kind: 'error', message: FALLBACK.error };
    return {
      ok: true,
      status: parsed.data.status,
      rejectReason: parsed.data.reject_reason ?? null,
      application: parsed.data.application ?? null,
    };
  } catch (e) {
    return { ok: false, ...mapError(e) };
  }
}

/** Submit (or re-submit) the application. The body is already Zod-validated by the store. */
export async function submitApplication(input: ApplicationInput): Promise<SubmitResult> {
  try {
    const data = await apiPost<unknown>({
      path: '/livreur-apply',
      body: {
        full_name: input.full_name,
        city: input.city,
        vehicle_type: input.vehicle_type,
        // The backend accepts id_photo_url omitted or as a string — NEVER null: its
        // validator rejects null → 400 INVALID_BODY (« Corps invalide »). Only send the
        // field when we actually have a URL; omit it otherwise (no ID photo attached).
        ...(input.id_photo_url ? { id_photo_url: input.id_photo_url } : {}),
        answers: input.answers,
      },
    });
    const parsed = ApplyResponseSchema.safeParse(data);
    if (!parsed.success) return { ok: false, kind: 'error', message: FALLBACK.error };
    return { ok: true, application: parsed.data.application ?? null };
  } catch (e) {
    return { ok: false, ...mapError(e) };
  }
}
