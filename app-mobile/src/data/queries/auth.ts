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
  roles?: ('buyer' | 'seller' | 'agent' | 'livreur')[];
  // Phase K.4: returned by email-signin so the Next.js admin shell can gate
  // on it without a separate get-me round-trip. Mobile users always see
  // is_admin = false; the mobile UI never reads it.
  is_admin?: boolean;
  // Undefined until the account has visited Profil > Confidentialité and
  // touched the toggle at least once ; treat as `true` (the DB default) until
  // then — see settings/privacy.tsx.
  profile_public?: boolean;
  personalize_feed?: boolean;
}

export interface TokenBundle {
  access_token: string;
  refresh_token: string;
}

export interface AuthBundle extends TokenBundle {
  user: AuthUser;
  // otp-verify returns this so the client can tell login from signup —
  // returning users (was_created=false) must skip profile-setup, which
  // would otherwise overwrite their display_name + roles via update-profile.
  // Optional because email-signup/email-signin don't carry it.
  was_created?: boolean;
}

export function useRequestOtp() {
  return useMutation({
    // `delivery` says which rail actually carried the code. A phone request can
    // come back as 'whatsapp' (Guinean carriers reject our SMS until the LINKY
    // sender is registered), and the code screen must name the right app —
    // otherwise people wait on their messages while the code sits in WhatsApp.
    mutationFn: async (input: { channel: 'phone' | 'email'; target: string }): Promise<{ otp_id: string; dev_code?: string; delivery?: 'sms' | 'whatsapp' | 'email' }> => {
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
    /** `password` : uniquement lors d'une INSCRIPTION. Le serveur ne l'applique
     *  que si ce code vient de créer le compte — sur un compte existant il est
     *  ignoré, sans quoi ce point d'entrée deviendrait une prise de contrôle. */
    mutationFn: async (input: { otp_id: string; code: string; password?: string }): Promise<AuthBundle> => {
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

/** Jumelle de useEmailSignin pour les comptes créés par téléphone. Même
 *  protections côté serveur, même forme de réponse — seule la serrure change. */
export function usePhoneSignin() {
  return useMutation({
    mutationFn: async (input: { phone: string; password: string }): Promise<AuthBundle> => {
      return apiPost({
        path: '/phone-signin',
        authed: false,
        body: input,
      });
    },
  });
}

// Lets an already-authed user set/change their password, so a future session
// expiry can be resolved with email-signin instead of always needing a fresh
// OTP (client 2026-08-05). A STALE session (>10 min old) gets an OTP_REQUIRED
// error back — see usePasswordChangeRequest — a fresh one (just signed in,
// including via "mot de passe oublié") goes straight through.
export function useSetPassword() {
  return useMutation({
    mutationFn: async (input: { password: string; otpId?: string; code?: string }): Promise<{ ok: boolean }> => {
      return apiPost({
        path: '/set-password',
        body: { password: input.password, otp_id: input.otpId, code: input.code },
      });
    },
  });
}

// Step-up: sends a confirmation code to the caller's OWN verified email or
// phone (server-resolved, never client-supplied) before a password change on
// a stale session (client 2026-08-05).
export function usePasswordChangeRequest() {
  return useMutation({
    mutationFn: async (channel: 'email' | 'phone'): Promise<{ otp_id: string; target_masked: string }> => {
      return apiPost({ path: '/password-change-request', body: { channel } });
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
  roles?: ('buyer' | 'seller' | 'agent' | 'livreur')[];
  // Public URL of an avatar already uploaded to the avatars bucket (see
  // useUploadAvatar). Empty string clears it.
  avatar_url?: string;
  // false = comments/reviews show an anonymized name to OTHER users (client
  // 2026-08-06). A shop's own listings stay visible either way.
  profile_public?: boolean;
  // false = Découvrir stays purely chronological ; true nudges it by the
  // caller's own favorites (client 2026-08-06).
  personalize_feed?: boolean;
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

// « Télécharger mes données » (client 2026-08-06) — real self-serve export,
// emailed to the account's own registered address.
export function useExportMyData() {
  return useMutation({
    mutationFn: async (): Promise<{ sent: boolean; to: string }> => {
      return apiPost({ path: '/export-my-data', body: {} });
    },
  });
}

export type AvatarMime = 'image/jpeg' | 'image/png' | 'image/webp';

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
