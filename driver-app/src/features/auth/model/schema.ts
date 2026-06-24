import { z } from 'zod';

/**
 * Auth input + wire contracts for the Linky OTP sign-in (email → 6-digit code).
 * Everything entering the app is validated at the edge (network + user input) —
 * see docs/security/checklist.md SEC-INPUT-001.
 */

/** Client-side email shape check before any network call. */
export const EmailSchema = z.email({ error: 'Enter a valid email address' });

/** The buyer/livreur OTP is always a 6-digit numeric code. */
export const OtpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code');

/**
 * `otp-request` response. `dev_code` is ONLY present when the deployed function
 * has no email transport configured (stub mode) — it lets QA proceed without an
 * inbox. In real delivery the field is absent (the code is emailed via Linky SMTP).
 */
export const OtpRequestResponseSchema = z.object({
  otp_id: z.string().min(1),
  dev_code: z.string().optional(),
});
export type OtpRequestResponse = z.infer<typeof OtpRequestResponseSchema>;

/**
 * The signed-in user as returned by `otp-verify` / `session-refresh` rehydration.
 * Extra fields (avatar_url, locale, kyc_status…) are ignored; we keep the lean
 * subset the driver app needs. `roles` must include `'livreur'` for a courier —
 * the deliveries list is empty otherwise (a backend concern).
 */
export const AuthUserSchema = z.object({
  id: z.string().min(1),
  display_name: z.string().nullable().optional(),
  roles: z.array(z.string()).optional(),
  city: z.string().nullable().optional(),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

/** `otp-verify` success bundle: the self-rolled JWT pair + the user. */
export const AuthBundleSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  user: AuthUserSchema,
  // Lets the client tell login from signup; a returning user (false) skips any
  // profile-setup step. Optional because session-refresh doesn't carry it.
  was_created: z.boolean().optional(),
});
export type AuthBundle = z.infer<typeof AuthBundleSchema>;

/** `session-refresh` rotates the pair. */
export const TokenBundleSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
});
export type TokenBundle = z.infer<typeof TokenBundleSchema>;

/**
 * Closed set of failure kinds the auth API maps every backend error code onto, so
 * the UI branches on a typed union (never a raw transport string). The server's
 * own French `message_fr` is carried alongside for display.
 */
export type OtpErrorKind =
  | 'rate_limited' // OTP_RATE_LIMITED — too many requests (per-minute / per-day)
  | 'too_many_attempts' // OTP_TOO_MANY_ATTEMPTS — too many wrong codes
  | 'invalid' // OTP_INVALID — wrong code
  | 'expired' // OTP_EXPIRED / OTP_ALREADY_USED — code no longer usable
  | 'not_found' // OTP_NOT_FOUND — unknown/expired otp_id
  | 'delivery_failed' // OTP_DELIVERY_FAILED — email couldn't be sent
  | 'offline' // transport failure — no connection (money/auth stays online)
  | 'error'; // anything else — generic, no internal leak
