import { create } from 'zustand';

import { fetchApplicationStatus, submitApplication } from '../lib/onboarding-api';
import { ApplicationInputSchema, type ApplicationInput, type ApplicationStatus } from './schema';

type Phase = 'unknown' | 'loading' | 'ready' | 'error';
type Result = { ok: true } | { ok: false; error: string };

/**
 * The livreur approval gate. Holds where the signed-in courier's application stands so
 * the router can lock the deliveries home until an admin approves (see use-livreur-gate).
 * Transient only — never persisted; the server is the source of truth and is re-checked
 * on auth + on app foreground.
 */
type OnboardingState = {
  phase: Phase;
  appStatus: ApplicationStatus | null;
  rejectReason: string | null;
  error: string | null;
  submitting: boolean;
  /** The gate call — `/livreur-application-status`. */
  refresh: () => Promise<void>;
  /** Submit (or re-submit) the application → moves to `pending` on success. */
  submit: (input: ApplicationInput) => Promise<Result>;
  /** From the rejection screen: « Refaire une demande » → back to the form. */
  reapply: () => void;
  /** Wipe gate state (wired on sign-out). */
  reset: () => void;
};

export const useOnboardingStore = create<OnboardingState>()((set, get) => ({
  phase: 'unknown',
  appStatus: null,
  rejectReason: null,
  error: null,
  submitting: false,

  refresh: async () => {
    set({ phase: get().phase === 'ready' ? 'ready' : 'loading', error: null });
    const result = await fetchApplicationStatus();
    if (result.ok) {
      set({
        phase: 'ready',
        appStatus: result.status,
        rejectReason: result.rejectReason,
        error: null,
      });
      return;
    }
    // A transient failure must not eject a courier from a known state (e.g. an offline
    // foreground refresh on the pending screen). Keep the last status if we have one;
    // only a cold check with nothing known surfaces the error/retry screen.
    if (get().appStatus !== null) {
      set({ phase: 'ready', error: result.message });
    } else {
      set({ phase: 'error', error: result.message });
    }
  },

  submit: async (input) => {
    const parsed = ApplicationInputSchema.safeParse(input);
    if (!parsed.success) {
      const error = parsed.error.issues[0]?.message ?? 'Vérifie les informations saisies.';
      set({ error });
      return { ok: false, error };
    }
    set({ submitting: true, error: null });
    const result = await submitApplication(parsed.data);
    set({ submitting: false });

    if (result.ok) {
      set({ appStatus: 'pending', phase: 'ready', rejectReason: null, error: null });
      return { ok: true };
    }
    // An in-flight application or an already-approved caller are not user-facing errors —
    // route them to the right gate screen instead.
    if (result.kind === 'pending_exists') {
      set({ appStatus: 'pending', phase: 'ready', error: null });
      return { ok: true };
    }
    if (result.kind === 'already_livreur') {
      set({ appStatus: 'approved', phase: 'ready', error: null });
      return { ok: true };
    }
    set({ error: result.message });
    return { ok: false, error: result.message };
  },

  reapply: () => set({ appStatus: 'none', rejectReason: null, error: null, phase: 'ready' }),

  reset: () =>
    set({ phase: 'unknown', appStatus: null, rejectReason: null, error: null, submitting: false }),
}));

/** True once we know the courier is an approved livreur (deliveries home unlocks). */
export const selectIsApproved = (s: OnboardingState): boolean => s.appStatus === 'approved';
