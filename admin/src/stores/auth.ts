'use client';

import { create } from 'zustand';

interface AdminSession {
  email: string;
  name: string;
  env: 'production' | 'staging';
}

interface AuthState {
  session: AdminSession | null;
  signIn: (email: string) => void;
  signOut: () => void;
}

function loadSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('linky-admin-session');
    return raw ? (JSON.parse(raw) as AdminSession) : null;
  } catch {
    return null;
  }
}

function saveSession(s: AdminSession | null) {
  if (typeof window === 'undefined') return;
  if (s) window.localStorage.setItem('linky-admin-session', JSON.stringify(s));
  else window.localStorage.removeItem('linky-admin-session');
}

export const useAuth = create<AuthState>((set) => ({
  session: loadSession(),
  signIn: (email) => {
    const session: AdminSession = {
      email,
      name: email.split('@')[0]!.replace(/\W/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      env: 'staging',
    };
    saveSession(session);
    set({ session });
  },
  signOut: () => {
    saveSession(null);
    set({ session: null });
  },
}));
