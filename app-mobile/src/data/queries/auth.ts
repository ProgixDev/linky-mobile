// Auth mutations: phone OTP request/verify, session refresh, email signup/signin.
// All hit Supabase Edge Functions deployed under /functions/v1.

import { useMutation } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';

export interface AuthUser {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  locale: string;
  city?: string | null;
  kyc_status?: string | null;
  // Phase K.4: returned by email-signin so the Next.js admin shell can gate
  // on it without a separate get-me round-trip. Mobile users always see
  // is_admin = false; the mobile UI never reads it.
  is_admin?: boolean;
}

export interface TokenBundle {
  access_token: string;
  refresh_token: string;
}

export interface AuthBundle extends TokenBundle {
  user: AuthUser;
}

export function useRequestOtp() {
  return useMutation({
    mutationFn: async (input: { channel: 'phone' | 'email'; target: string }): Promise<{ otp_id: string; dev_code?: string }> => {
      return apiPost({
        path: '/otp-request',
        authed: false,
        body: { ...input, purpose: 'signin' },
      });
    },
  });
}

export function useVerifyOtp() {
  return useMutation({
    mutationFn: async (input: { otp_id: string; code: string }): Promise<AuthBundle> => {
      return apiPost({
        path: '/otp-verify',
        authed: false,
        body: input,
      });
    },
  });
}

export function useEmailSignup() {
  return useMutation({
    mutationFn: async (input: { email: string; password: string }): Promise<AuthBundle> => {
      return apiPost({
        path: '/email-signup',
        authed: false,
        body: input,
      });
    },
  });
}

export function useEmailSignin() {
  return useMutation({
    mutationFn: async (input: { email: string; password: string }): Promise<AuthBundle> => {
      return apiPost({
        path: '/email-signin',
        authed: false,
        body: input,
      });
    },
  });
}

// Direct refresh helper for cases where the fetch wrapper's auto-refresh isn't appropriate
// (e.g. app boot, where we want to validate the stored token before any UI renders).
export async function refreshSession(refreshToken: string): Promise<TokenBundle> {
  return apiPost({
    path: '/session-refresh',
    authed: false,
    body: { refresh_token: refreshToken },
  });
}
