import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '@/shared/lib/supabase';

import { CredentialsSchema } from './schema';

type Status = 'loading' | 'authenticated' | 'unauthenticated';

type Result = { ok: true } | { ok: false; error: string };

type AuthState = {
  status: Status;
  session: Session | null;
  error: string | null;
  /** Load the current session and subscribe to changes. Returns an unsubscribe. */
  init: () => () => void;
  signIn: (email: string, password: string) => Promise<Result>;
  signUp: (email: string, password: string) => Promise<Result>;
  signOut: () => Promise<void>;
  /** Permanently delete the account + all its data (store-compliance requirement). */
  deleteAccount: () => Promise<Result>;
};

function statusFor(session: Session | null): Status {
  return session ? 'authenticated' : 'unauthenticated';
}

export const useAuthStore = create<AuthState>()((set) => ({
  status: 'loading',
  session: null,
  error: null,

  init: () => {
    void supabase.auth.getSession().then(({ data }) => {
      set({ session: data.session, status: statusFor(data.session) });
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, status: statusFor(session) });
    });
    return () => data.subscription.unsubscribe();
  },

  signIn: async (email, password) => {
    const parsed = CredentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      const error = parsed.error.issues[0]?.message ?? 'Invalid credentials';
      set({ error });
      return { ok: false, error };
    }
    set({ error: null });
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) {
      set({ error: error.message });
      return { ok: false, error: error.message };
    }
    return { ok: true };
  },

  signUp: async (email, password) => {
    const parsed = CredentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      const error = parsed.error.issues[0]?.message ?? 'Invalid credentials';
      set({ error });
      return { ok: false, error };
    }
    set({ error: null });
    const { error } = await supabase.auth.signUp(parsed.data);
    if (error) {
      set({ error: error.message });
      return { ok: false, error: error.message };
    }
    return { ok: true };
  },

  signOut: async () => {
    // supabase-js clears the LargeSecureStore session via its storage adapter.
    await supabase.auth.signOut();
    set({ session: null, status: 'unauthenticated', error: null });
  },

  deleteAccount: async () => {
    // The Edge Function validates the JWT and deletes the user + cascaded data.
    // `invoke` attaches the current session's Authorization header automatically.
    const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
    if (error) {
      set({ error: error.message });
      return { ok: false, error: error.message };
    }
    await supabase.auth.signOut();
    set({ session: null, status: 'unauthenticated', error: null });
    return { ok: true };
  },
}));

export const selectIsAuthenticated = (s: AuthState): boolean => s.status === 'authenticated';
