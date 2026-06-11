import { create } from 'zustand';
import { storage, STORAGE_KEYS, secure, SECURE_KEYS } from '../lib/storage';
import { useCart } from './cart';
import type { AuthUser } from '../data/queries/auth';

type AuthChannel = 'phone' | 'email';
export type UserRole = 'buyer' | 'seller' | 'agent';
// UI ids used in profile-setup step 3 → canonical UserRole.
export const ROLE_FROM_UI: Record<'buy' | 'sell' | 'agent', UserRole> = {
  buy: 'buyer',
  sell: 'seller',
  agent: 'agent',
};

interface AuthState {
  user: AuthUser | null;
  // Real backend user UUID, populated from otp-verify / email signin response.
  // Use this for any backend call that needs the caller's id at the API layer.
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
  signIn: (user: AuthUser) => void;
  signOut: () => Promise<void>;
  completeOnboarding: (roles?: UserRole[]) => void;
}

const initialDone = storage.getBoolean(STORAGE_KEYS.onboardingDone) ?? false;
const initialUserId = storage.getString(STORAGE_KEYS.currentUserId);

function loadAuthUser(): AuthUser | null {
  const raw = storage.getString(STORAGE_KEYS.authUserJson);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthUser;
    if (parsed && typeof parsed.id === 'string') return parsed;
  } catch {
    // ignore — treat as no persisted user
  }
  return null;
}

function saveAuthUser(user: AuthUser) {
  storage.set(STORAGE_KEYS.authUserJson, JSON.stringify(user));
}

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
  // Hydrate from MMKV: if onboarded and we have a stored user id, restore the
  // AuthUser snapshot from the last sign-in. authUserId can be set without user
  // (defensive — e.g. user JSON corruption), but never the other way around.
  user: initialDone && initialUserId ? loadAuthUser() : null,
  authUserId: initialDone && initialUserId ? initialUserId : null,
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
  signIn: (user) => {
    // Real auth only — caller (otp-verify / email-signin) passes the backend AuthUser.
    storage.set(STORAGE_KEYS.currentUserId, user.id);
    saveAuthUser(user);
    // Phase T.1 — server wins on roles. The auth payloads carry the
    // canonical roles array ; MMKV only stays as the offline cache. If the
    // server payload omits roles (older fn, mid-deploy state), fall back to
    // whatever was last cached locally rather than wiping to ['buyer'].
    const serverRoles = Array.isArray(user.roles) && user.roles.length > 0
      ? (user.roles as UserRole[])
      : null;
    if (serverRoles) {
      saveRoles(serverRoles);
      set({ user, authUserId: user.id, roles: serverRoles });
    } else {
      set({ user, authUserId: user.id });
    }
  },
  signOut: async () => {
    // V1: clears local credentials + persisted user + roles + cart. The remote
    // session revoke endpoint lands later (TODO: /v1/session/revoke).
    await secure.remove(SECURE_KEYS.authToken);
    await secure.remove(SECURE_KEYS.refreshToken);
    storage.remove(STORAGE_KEYS.currentUserId);
    storage.remove(STORAGE_KEYS.authUserJson);
    storage.remove(STORAGE_KEYS.roles);
    storage.set(STORAGE_KEYS.onboardingDone, false);
    useCart.getState().clear();
    set({
      user: null,
      authUserId: null,
      isOnboarded: false,
      pendingOtpId: null,
      pendingDevCode: null,
      pendingPhone: '+224 622 55 12 88',
      pendingEmail: '',
      roles: ['buyer'],
    });
  },
  completeOnboarding: (roles) => {
    // Refuse onboarding completion if no real auth has happened. signIn() must
    // have populated currentUserId via OTP / email flow before this can succeed;
    // otherwise we'd flip isOnboarded=true with no auth backing — the dev bypass
    // we explicitly removed.
    const persistedId = storage.getString(STORAGE_KEYS.currentUserId);
    if (!persistedId) return;
    storage.set(STORAGE_KEYS.onboardingDone, true);
    const user = loadAuthUser();
    if (roles && roles.length > 0) {
      saveRoles(roles);
      set({ isOnboarded: true, user, authUserId: persistedId, roles });
    } else {
      set({ isOnboarded: true, user, authUserId: persistedId });
    }
  },
}));
