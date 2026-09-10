import { z } from 'zod';

/**
 * Auth input + wire contracts for the Linky OTP sign-in (email → 6-digit code).
 * Everything entering the app is validated at the edge (network + user input) —
 * see docs/security/checklist.md SEC-INPUT-001.
 */

/**
 * Numero mobile guineen, rendu en E.164 pour le serveur.
 *
 * LE CLIENT A DEMANDE L'INSCRIPTION PAR TELEPHONE UNIQUEMENT le 2026-09-10 :
 * « permettre l'inscription sur Linky driver avec numero de telephone
 * uniquement et meme si celui a ete utilise sur Linky (marketplace) ».
 *
 * On accepte ce que les gens tapent — espaces, indicatif colle, +224 — et on
 * n'impose la forme qu'a la fin. Exiger une saisie propre sur un ecran de
 * connexion, c'est refuser des gens pour un espace.
 *
 * `otp-request` attend du E.164 strict (_shared/validate.ts:1-4), d'ou la
 * recomposition en +224 apres controle.
 */
export const GnPhoneSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, '').replace(/^224/, ''))
  .refine((d) => /^6\d{8}$/.test(d), { error: 'Numéro invalide (9 chiffres, commence par 6)' })
  .transform((d) => `+224${d}`);

/** The buyer/livreur OTP is always a 6-digit numeric code. */
export const OtpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code');

/**
 * Reponse d'`otp-request`. `dev_code` n'est present QUE si la fonction deployee
 * n'a aucun transport configure (mode stub) — il permet a la recette d'avancer
 * sans telephone. En livraison reelle le champ est absent : le code part par SMS
 * ou WhatsApp (Prelude), depuis le passage au telephone le 2026-09-10.
 */
export const OtpRequestResponseSchema = z.object({
  otp_id: z.string().min(1),
  dev_code: z.string().optional(),
});
export type OtpRequestResponse = z.infer<typeof OtpRequestResponseSchema>;

/**
 * The signed-in user as returned by `otp-verify` / `session-refresh` rehydration.
 * Lean subset the driver app needs (locale, kyc_status… are ignored). `avatar_url`
 * is the courier's profile photo (editable in Profil via `update-profile`). `roles`
 * must include `'livreur'` for a courier — the deliveries list is empty otherwise.
 */
export const AuthUserSchema = z.object({
  id: z.string().min(1),
  display_name: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
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
  | 'delivery_failed' // OTP_DELIVERY_FAILED — le code n'a pas pu partir
  | 'offline' // transport failure — no connection (money/auth stays online)
  // 'email_in_marketplace' a ete RETIRE le 2026-09-10. Le garde serveur qui le
  // levait n'existe que pour le canal e-mail (otp-request/index.ts:29) ; depuis
  // que cette app s'authentifie par telephone, il ne peut plus se declencher.
  // Le client a d'ailleurs demande l'inverse : un numero deja connu du
  // marketplace DOIT pouvoir devenir livreur.
  | 'error'; // anything else — generic, no internal leak
