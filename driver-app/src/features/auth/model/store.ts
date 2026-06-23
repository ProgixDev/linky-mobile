import { create } from 'zustand';

import { ApiError, apiPost } from '@/shared/lib/api';
import { session } from '@/shared/lib/session';
import { appStorage } from '@/shared/lib/storage';

import { AuthBundleSchema, AuthUserSchema, CredentialsSchema, type AuthUser } from './schema';

type Status = 'loading' | 'authenticated' | 'unauthenticated';
type Result = { ok: true } | { ok: false; error: string };

// Non-sensitive profile cache (id/name/roles) so a refreshed session on boot can
// rehydrate the user without a round-trip. Tokens live in secureStorage (session).
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
  /** Boot: validate the stored refresh token and rehydrate the session. */
  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<Result>;
  signUp: (email: string, password: string) => Promise<Result>;
  signOut: () => Promise<void>;
  /** In-app account deletion (store-compliance). Needs a backend `delete-account`. */
  deleteAccount: () => Promise<Result>;
};

export const useAuthStore = create<AuthState>()((set) => {
  // Shared sign-in/sign-up path: validate → call the Linky auth endpoint →
  // persist tokens + cache user → authenticated.
  const run = async (path: string, email: string, password: string): Promise<Result> => {
    const parsed = CredentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      const error = parsed.error.issues[0]?.message ?? 'Invalid credentials';
      set({ error });
      return { ok: false, error };
    }
    set({ error: null });
    try {
      const data = await apiPost<unknown>({ path, body: parsed.data, authed: false });
      const bundle = AuthBundleSchema.parse(data);
      await session.set(bundle);
      await cacheUser(bundle.user);
      set({ user: bundle.user, status: 'authenticated', error: null });
      return { ok: true };
    } catch (e) {
      const error = e instanceof ApiError ? e.message_fr : 'Could not sign in. Try again.';
      set({ error });
      return { ok: false, error };
    }
  };

  return {
    status: 'loading',
    user: null,
    error: null,

    init: async () => {
      const refresh = await session.getRefreshToken();
      if (!refresh) {
        set({ status: 'unauthenticated' });
        return;
      }
      try {
        const tokens = await apiPost<{ access_token: string; refresh_token: string }>({
          path: '/session-refresh',
          body: { refresh_token: refresh },
          authed: false,
        });
        await session.set(tokens);
        set({ user: await loadCachedUser(), status: 'authenticated' });
      } catch {
        await session.clear();
        set({ status: 'unauthenticated' });
      }
    },

    signIn: (email, password) => run('/email-signin', email, password),
    signUp: (email, password) => run('/email-signup', email, password),

    signOut: async () => {
      await session.clear();
      await cacheUser(null);
      set({ user: null, status: 'unauthenticated', error: null });
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
  };
});

export const selectIsAuthenticated = (s: AuthState): boolean => s.status === 'authenticated';
