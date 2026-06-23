import { z } from 'zod';

/**
 * Auth input contract. Validated at the edge before any network call — see
 * docs/security/checklist.md SEC-INPUT-001.
 */
export const CredentialsSchema = z.object({
  email: z.email({ error: 'Enter a valid email address' }),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type Credentials = z.infer<typeof CredentialsSchema>;

/**
 * Shape of the user + token bundle returned by the Linky auth endpoints
 * (`/email-signin`, `/email-signup`, `/otp-verify`). Validated when it arrives
 * (network is a trust boundary). Extra fields are ignored.
 */
export const AuthUserSchema = z.object({
  id: z.string().min(1),
  display_name: z.string().nullable().optional(),
  roles: z.array(z.string()).optional(),
  city: z.string().nullable().optional(),
});

export type AuthUser = z.infer<typeof AuthUserSchema>;

export const AuthBundleSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  user: AuthUserSchema,
  was_created: z.boolean().optional(),
});

export type AuthBundle = z.infer<typeof AuthBundleSchema>;
