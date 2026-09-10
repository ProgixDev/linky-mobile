import { create } from 'zustand';

import { ApiError, apiPost } from '@/shared/lib/api';
import { unregisterPushToken } from '@/shared/lib/push';
import { session } from '@/shared/lib/session';
import { appStorage } from '@/shared/lib/storage';

import {
  refreshSession,
  requestOtp,
  updateProfile as apiUpdateProfile,
  verifyOtp,
  type ProfilePatch,
} from '../lib/auth-api';
import { AuthUserSchema, GnPhoneSchema, OtpCodeSchema, type AuthUser } from './schema';

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
  // Etat transitoire du flux OTP (non persiste) : l'otp_id en cours, le numero
  // auquel le code est parti (pour le renvoi), et un code echo en mode stub.
  otpId: string | null;
  /** Le numero en E.164 auquel le code a ete envoye (pour le renvoi). */
  pendingPhone: string | null;
  devCode: string | null;

  /** Boot: validate the stored refresh token and rehydrate the session. */
  init: () => Promise<void>;
  /** Step 1 — numero → demande d'OTP. Le numero est valide et normalise ici. */
  requestCode: (phone: string) => Promise<Result>;
  /** Step 2 — verify the 6-digit code → persist tokens → authenticated. */
  verifyCode: (code: string) => Promise<Result>;
  /** Renvoie un code au numero en cours (l'ecran impose le delai d'attente). */
  resendCode: () => Promise<Result>;
  /** Retour a l'etape du numero (annule l'OTP en cours). */
  resetOtp: () => void;
  signOut: () => Promise<void>;
  /** In-app account deletion (store-compliance). Hits the backend `delete-account`. */
  deleteAccount: () => Promise<Result>;
  /** Update the courier's profile (e.g. avatar_url) via `update-profile`; re-caches the user. */
  updateProfile: (patch: ProfilePatch) => Promise<Result>;
};

export const useAuthStore = create<AuthState>()((set, get) => ({
  status: 'loading',
  user: null,
  error: null,
  otpId: null,
  pendingPhone: null,
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

  requestCode: async (phone) => {
    const parsed = GnPhoneSchema.safeParse(phone);
    if (!parsed.success) {
      const error = parsed.error.issues[0]?.message ?? 'Numéro invalide';
      set({ error });
      return { ok: false, error };
    }
    set({ error: null });
    const result = await requestOtp({ phone: parsed.data });
    if (!result.ok) {
      set({ error: result.message });
      return { ok: false, error: result.message };
    }
    set({
      otpId: result.otpId,
      pendingPhone: parsed.data,
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
      pendingPhone: null,
      devCode: null,
    });
    return { ok: true };
  },

  resendCode: async () => {
    const { pendingPhone } = get();
    if (!pendingPhone) return { ok: false, error: 'Aucun numéro à qui renvoyer le code' };
    return get().requestCode(pendingPhone);
  },

  resetOtp: () => set({ otpId: null, pendingPhone: null, devCode: null, error: null }),

  signOut: async () => {
    // Stop pushes to this device FIRST — the unregister call is authed, so it must
    // run while the session is still live. Best-effort; never blocks sign-out.
    await unregisterPushToken();
    await session.clear();
    await cacheUser(null);
    set({
      user: null,
      status: 'unauthenticated',
      error: null,
      otpId: null,
      pendingPhone: null,
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
    // Drop this device's push token before tearing the session down (authed call).
    await unregisterPushToken();
    await session.clear();
    await cacheUser(null);
    set({ user: null, status: 'unauthenticated', error: null });
    return { ok: true };
  },

  updateProfile: async (patch) => {
    const prev = get().user;
    // Optimistic: reflect the patch locally RIGHT AWAY so the UI swaps to the chosen
    // photo immediately. Crucially we also KEEP the patched fields when merging the
    // server response — the shared update-profile endpoint may not echo avatar_url
    // back yet, and without this the chosen photo would snap back to the old DB avatar.
    if (prev) {
      const optimistic = { ...prev, ...patch };
      set({ user: optimistic });
      await cacheUser(optimistic);
    }
    try {
      const user = await apiUpdateProfile(patch);
      const merged = { ...user, ...patch };
      await cacheUser(merged);
      set({ user: merged, error: null });
      return { ok: true };
    } catch (e) {
      // Keep the optimistic avatar (the photo IS uploaded to storage + shown); the
      // patch persists for this session even if the backend save isn't wired yet.
      const error = e instanceof ApiError ? e.message_fr : 'Mise à jour impossible.';
      set({ error });
      return { ok: false, error };
    }
  },
}));

export const selectIsAuthenticated = (s: AuthState): boolean => s.status === 'authenticated';
