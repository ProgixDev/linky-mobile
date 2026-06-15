// Auth mutations: phone OTP request/verify, session refresh, email signup/signin.
// All hit Supabase Edge Functions deployed under /functions/v1.

import { useMutation } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';
import { optimizePhoto } from '../../lib/photoOptimize';
import type { PhotoUploadUrl } from './products';

export interface AuthUser {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  locale: string;
  city?: string | null;
  kyc_status?: string | null;
  // Phase T.1: returned by otp-verify / email-signin / email-signup /
  // update-profile so the auth store rehydrates roles from the server (the
  // single source of truth ; MMKV is the offline cache).
  roles?: ('buyer' | 'seller' | 'agent')[];
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

// Phase T.1 — single endpoint that powers onboarding's profile-setup finish,
// the new "Mes rôles" screen, and the "Devenir vendeur" upgrade pitch. Every
// field is optional ; the server applies whichever subset is sent.
export interface UpdateProfileInput {
  display_name?: string;
  city?: string;
  roles?: ('buyer' | 'seller' | 'agent')[];
  // Public URL of an avatar already uploaded to the avatars bucket (see
  // useUploadAvatar). Empty string clears it.
  avatar_url?: string;
}
export function useUpdateProfile() {
  return useMutation({
    mutationFn: async (input: UpdateProfileInput): Promise<{ user: AuthUser }> => {
      return apiPost({
        path: '/update-profile',
        authed: true,
        body: input,
      });
    },
  });
}

type AvatarMime = 'image/jpeg' | 'image/png' | 'image/webp';

// Picks up a local image URI, optimizes it, uploads it to the avatars bucket via
// a one-shot signed URL, and returns the public_url to hand to useUpdateProfile.
// Mirrors the create-listing photo flow but for the single profile avatar.
export function useUploadAvatar() {
  return useMutation({
    mutationFn: async (input: { uri: string; mime: AvatarMime }): Promise<string> => {
      const optimized = await optimizePhoto(input.uri, input.mime);
      const ext = optimized.mimeType === 'image/png' ? 'png' : optimized.mimeType === 'image/webp' ? 'webp' : 'jpg';
      const { upload_url, public_url } = await apiPost<PhotoUploadUrl>({
        path: '/photo-upload-url',
        authed: true,
        body: { kind: 'avatar', filename: `avatar.${ext}`, content_type: optimized.mimeType },
      });
      const blob = await (await fetch(optimized.uri)).blob();
      const put = await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': optimized.mimeType, 'x-upsert': 'true' },
        body: blob,
      });
      if (!put.ok) {
        const raw = await put.text().catch(() => '');
        console.error('[avatar] storage PUT failed', put.status, raw);
        throw new Error('avatar upload failed');
      }
      return public_url;
    },
  });
}
