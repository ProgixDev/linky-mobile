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
