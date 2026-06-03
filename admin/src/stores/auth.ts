'use client';

import { create } from 'zustand';

// Phase K.4 — real admin session backed by the Linky email-signin endpoint.
// access_token is the 15-min HS256 JWT signed with LINKY_JWT_SECRET (see
// app-mobile/supabase/functions/_shared/jwt.ts). refresh_token is the
// session.id + secret pair used to rotate the access via /session-refresh.
//
// Persistence: localStorage. V1.1 (memo project_admin_cookie_v1_1) will move
// to httpOnly cookies + Next.js middleware so the bearer is never readable by
// page JS — until then, localStorage is the simplest path and the risk is
// acceptable because the admin shell is a small, single-page surface served
// from a noindex domain.

const STORAGE_KEY = 'linky-admin-session';

// Access TTL is 15min on the server (jwt.ts ACCESS_TTL_SEC). We refresh
// proactively when we're within REFRESH_LEAD_SEC of expiry to avoid the
// first request after a stale tab firing a 401 + retry.
const REFRESH_LEAD_SEC = 60;

export interface AdminSession {
  accessToken: string;
  refreshToken: string;
  /** Unix epoch seconds — when access_token expires. */
  accessTokenExpiresAt: number;
  userId: string;
  email: string;
  isAdmin: boolean;
  displayName?: string | null;
}

interface AuthState {
  session: AdminSession | null;
  /** True only after we've attempted to hydrate from localStorage (or
   *  determined we're on the server). Guards Shell against rendering the
   *  authed UI before localStorage is read. */
  hydrated: boolean;
  setSession: (s: AdminSession) => void;
  clearSession: () => void;
  /** Updates tokens + expiry after a successful /session-refresh. Keeps
   *  user info (email/displayName/isAdmin/userId) — refresh doesn't return
   *  those, we just rotate the bearer. */
  applyRefresh: (input: { accessToken: string; refreshToken: string; accessTokenExpiresAt: number }) => void;
  /** Internal hydration toggle — call once at app mount inside an effect. */
  hydrate: () => void;
}

function loadSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AdminSession>;
    if (
      typeof parsed.accessToken === 'string' &&
      typeof parsed.refreshToken === 'string' &&
      typeof parsed.accessTokenExpiresAt === 'number' &&
      typeof parsed.userId === 'string' &&
      typeof parsed.email === 'string' &&
      typeof parsed.isAdmin === 'boolean'
    ) {
      return parsed as AdminSession;
    }
    return null;
  } catch {
    return null;
  }
}

function saveSession(s: AdminSession | null) {
  if (typeof window === 'undefined') return;
  if (s) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  else window.localStorage.removeItem(STORAGE_KEY);
}

export const useAuth = create<AuthState>((set, get) => ({
  // Hydration is deferred to an effect so SSR + first client render see the
  // same null session and never flicker. The Shell component calls hydrate()
  // on mount before deciding whether to redirect.
  session: null,
  hydrated: false,
  setSession: (session) => {
    saveSession(session);
    set({ session, hydrated: true });
  },
  clearSession: () => {
    saveSession(null);
    set({ session: null, hydrated: true });
  },
  applyRefresh: ({ accessToken, refreshToken, accessTokenExpiresAt }) => {
    const cur = get().session;
    if (!cur) return;
    const next: AdminSession = { ...cur, accessToken, refreshToken, accessTokenExpiresAt };
    saveSession(next);
    set({ session: next });
  },
  hydrate: () => {
    if (get().hydrated) return;
    set({ session: loadSession(), hydrated: true });
  },
}));

/** True when the access token is within REFRESH_LEAD_SEC of expiry (or already
 *  past it). Read this before each apiFetch to decide whether to refresh first. */
export function isAccessNearExpiry(s: AdminSession): boolean {
  const now = Math.floor(Date.now() / 1000);
  return s.accessTokenExpiresAt - now <= REFRESH_LEAD_SEC;
}
