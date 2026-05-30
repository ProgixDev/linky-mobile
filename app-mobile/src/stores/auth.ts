import { create } from 'zustand';
import { storage, STORAGE_KEYS, secure, SECURE_KEYS } from '../lib/storage';
import { CURRENT_USER_ID, getUser } from '../data/mockUsers';
import type { User } from '../data/types';

type AuthChannel = 'phone' | 'email';
export type UserRole = 'buyer' | 'seller' | 'agent';
// UI ids used in profile-setup step 3 → canonical UserRole.
export const ROLE_FROM_UI: Record<'buy' | 'sell' | 'agent', UserRole> = {
  buy: 'buyer',
  sell: 'seller',
  agent: 'agent',
};

interface AuthState {
  user: User | null;
  // Real Supabase user UUID, populated from otp-verify response. Stays set even when
  // `user` is null (mock lookup misses real UUIDs); use this for any backend call
  // that needs the caller's id at the API layer (e.g. owner_id filters).
  authUserId: string | null;
  isOnboarded: boolean;
  channel: AuthChannel;
  pendingPhone: string;
  pendingEmail: string;
  pendingOtpId: string | null;
  // DEV-ONLY: the OTP code echoed by otp-request in stub mode, so otp.tsx can auto-fill
  // and the tester never reads server logs. Never populated when a real provider is wired.
  pendingDevCode: string | null;
  roles: UserRole[];
  setChannel: (c: AuthChannel) => void;
  setPendingPhone: (p: string) => void;
  setPendingEmail: (e: string) => void;
  setPendingOtpId: (id: string | null) => void;
  setPendingDevCode: (code: string | null) => void;
  setRoles: (r: UserRole[]) => void;
  setTokens: (access: string, refresh: string) => Promise<void>;
  signIn: (userId?: string) => void;
  signOut: () => Promise<void>;
  completeOnboarding: (roles?: UserRole[]) => void;
}

const initialDone = storage.getBoolean(STORAGE_KEYS.onboardingDone) ?? false;
const initialUserId = storage.getString(STORAGE_KEYS.currentUserId);

function loadRoles(): UserRole[] {
  const raw = storage.getString(STORAGE_KEYS.roles);
  if (!raw) return ['buyer'];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as UserRole[];
  } catch {
    // ignore
  }
  return ['buyer'];
}

function saveRoles(roles: UserRole[]) {
  storage.set(STORAGE_KEYS.roles, JSON.stringify(roles));
}

export const useAuth = create<AuthState>((set) => ({
  user: initialDone ? getUser(initialUserId ?? CURRENT_USER_ID) ?? null : null,
  authUserId: initialDone ? (initialUserId ?? CURRENT_USER_ID) : null,
  isOnboarded: initialDone,
  channel: 'phone',
  pendingPhone: '+224 622 55 12 88',
  pendingEmail: '',
  pendingOtpId: null,
  pendingDevCode: null,
  roles: loadRoles(),
  setChannel: (channel) => set({ channel }),
  setPendingPhone: (pendingPhone) => set({ pendingPhone }),
  setPendingEmail: (pendingEmail) => set({ pendingEmail }),
  setPendingOtpId: (pendingOtpId) => set({ pendingOtpId }),
  setPendingDevCode: (pendingDevCode) => set({ pendingDevCode }),
  setRoles: (roles) => {
    saveRoles(roles);
    set({ roles });
  },
  setTokens: async (access, refresh) => {
    await secure.set(SECURE_KEYS.authToken, access);
    await secure.set(SECURE_KEYS.refreshToken, refresh);
  },
  signIn: (userId = CURRENT_USER_ID) => {
    const user = getUser(userId) ?? null;
    storage.set(STORAGE_KEYS.currentUserId, userId);
    set({ user, authUserId: userId });
  },
  signOut: async () => {
    // V1: clears local credentials only. TODO(task #12): hit /v1/session/revoke once that endpoint exists.
    await secure.remove(SECURE_KEYS.authToken);
    await secure.remove(SECURE_KEYS.refreshToken);
    storage.remove(STORAGE_KEYS.currentUserId);
    storage.set(STORAGE_KEYS.onboardingDone, false);
    set({ user: null, authUserId: null, isOnboarded: false, pendingOtpId: null, pendingDevCode: null });
  },
  completeOnboarding: (roles) => {
    storage.set(STORAGE_KEYS.onboardingDone, true);
    // Preserve any real user id signIn() wrote during OTP verify; only fall back to
    // the mock CURRENT_USER_ID for first-install dev paths that skip auth entirely.
    const persistedId = storage.getString(STORAGE_KEYS.currentUserId) ?? null;
    const userId = persistedId ?? CURRENT_USER_ID;
    const user = getUser(userId) ?? null;
    if (!persistedId) storage.set(STORAGE_KEYS.currentUserId, CURRENT_USER_ID);
    if (roles && roles.length > 0) {
      saveRoles(roles);
      set({ isOnboarded: true, user, authUserId: userId, roles });
    } else {
      set({ isOnboarded: true, user, authUserId: userId });
    }
  },
}));
