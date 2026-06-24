import { create } from 'zustand';

import { ApiError, apiPost } from '@/shared/lib/api';
import { session } from '@/shared/lib/session';
import { appStorage } from '@/shared/lib/storage';

import { refreshSession, requestOtp, verifyOtp } from '../lib/auth-api';
import { AuthUserSchema, EmailSchema, OtpCodeSchema, type AuthUser } from './schema';

type Status = 'loading' | 'authenticated' | 'unauthenticated';
type Result = { ok: true } | { ok: false; error: string };

// Non-sensitive profile cache (id/name/roles/city) so a refreshed session on boot
// rehydrates the user without a round-trip. TOKENS never live here — they go to
// secureStorage via `session`. appStorage is plaintext AsyncStorage by design.
const USER_CACHE_KEY = 'auth-user-v1';

async function cacheUser(user: AuthUser | null): Promise<void> {
  if (user) await appStorage.set(USER_CACHE_KEY, JSON.stringify(user));
  else await appStorage.remove(USER_CACHE_KEY);
}

async function loadCachedUser(): Promise<AuthUser | null> {
  const raw = await appStorage.get(USER_CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = AuthUserSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

type AuthState = {
  status: Status;
  user: AuthUser | null;
  error: string | null;
  // Transient OTP flow state (not persisted): the in-flight otp_id, the email it
  // was sent to (for resend), and a dev-only echoed code (stub mode).
  otpId: string | null;
  pendingEmail: string | null;
  devCode: string | null;

  /** Boot: validate the stored refresh token and rehydrate the session. */
  init: () => Promise<void>;
  /** Step 1 — email → request an OTP. Validates the email client-side first. */
  requestCode: (email: string) => Promise<Result>;
  /** Step 2 — verify the 6-digit code → persist tokens → authenticated. */
  verifyCode: (code: string) => Promise<Result>;
  /** Re-send a code to the pending email (the screen gates this behind a cooldown). */
  resendCode: () => Promise<Result>;
  /** Back to the email step (clears the in-flight OTP). */
  resetOtp: () => void;
  signOut: () => Promise<void>;
  /** In-app account deletion (store-compliance). Hits the backend `delete-account`. */
  deleteAccount: () => Promise<Result>;
};

export const useAuthStore = create<AuthState>()((set, get) => ({
  status: 'loading',
  user: null,
  error: null,
  otpId: null,
  pendingEmail: null,
  devCode: null,

  init: async () => {
    const refresh = await session.getRefreshToken();
    if (!refresh) {
      set({ status: 'unauthenticated' });
      return;
    }
    try {
      const tokens = await refreshSession(refresh);
      await session.set(tokens);
      set({ user: await loadCachedUser(), status: 'authenticated' });
    } catch {
      // Refresh token invalid/expired/offline → require a fresh sign-in.
      await session.clear();
      set({ status: 'unauthenticated' });
    }
  },

  requestCode: async (email) => {
    const parsed = EmailSchema.safeParse(email.trim());
    if (!parsed.success) {
      const error = parsed.error.issues[0]?.message ?? 'Enter a valid email address';
      set({ error });
      return { ok: false, error };
    }
    set({ error: null });
    const result = await requestOtp({ email: parsed.data });
    if (!result.ok) {
      set({ error: result.message });
      return { ok: false, error: result.message };
    }
    set({
      otpId: result.otpId,
      pendingEmail: parsed.data,
      devCode: result.devCode ?? null,
      error: null,
    });
    return { ok: true };
  },

  verifyCode: async (code) => {
    const { otpId } = get();
    if (!otpId) {
      const error = 'Request a code first';
      set({ error });
      return { ok: false, error };
    }
    const parsed = OtpCodeSchema.safeParse(code);
    if (!parsed.success) {
      const error = parsed.error.issues[0]?.message ?? 'Enter the 6-digit code';
      set({ error });
      return { ok: false, error };
    }
    set({ error: null });
    const result = await verifyOtp({ otpId, code: parsed.data });
    if (!result.ok) {
      set({ error: result.message });
      return { ok: false, error: result.message };
    }
    await session.set(result.bundle);
    await cacheUser(result.bundle.user);
    set({
      user: result.bundle.user,
      status: 'authenticated',
      error: null,
      otpId: null,
      pendingEmail: null,
      devCode: null,
    });
    return { ok: true };
  },

  resendCode: async () => {
    const { pendingEmail } = get();
    if (!pendingEmail) return { ok: false, error: 'No email to resend to' };
    return get().requestCode(pendingEmail);
  },

  resetOtp: () => set({ otpId: null, pendingEmail: null, devCode: null, error: null }),

  signOut: async () => {
    await session.clear();
    await cacheUser(null);
    set({
      user: null,
      status: 'unauthenticated',
      error: null,
      otpId: null,
      pendingEmail: null,
      devCode: null,
    });
  },

  deleteAccount: async () => {
    try {
      await apiPost({ path: '/delete-account', body: {} });
    } catch (e) {
      const error = e instanceof ApiError ? e.message_fr : 'Could not delete account';
      set({ error });
      return { ok: false, error };
    }
    await session.clear();
    await cacheUser(null);
    set({ user: null, status: 'unauthenticated', error: null });
    return { ok: true };
  },
}));

export const selectIsAuthenticated = (s: AuthState): boolean => s.status === 'authenticated';
