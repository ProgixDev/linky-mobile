import { z } from 'zod';

/**
 * Runtime-validated environment. Import `env` instead of touching
 * `process.env` anywhere else in the codebase (enforced in review).
 *
 * Only EXPO_PUBLIC_* variables are inlined into the client bundle.
 * Secrets NEVER belong here — they live on the server or in EAS secrets.
 */
const EnvSchema = z.object({
  EXPO_PUBLIC_API_URL: z.url({ error: 'EXPO_PUBLIC_API_URL must be a valid URL' }),
  EXPO_PUBLIC_APP_ENV: z.enum(['development', 'preview', 'production']),
  EXPO_PUBLIC_SUPABASE_URL: z.url({ error: 'EXPO_PUBLIC_SUPABASE_URL must be a valid URL' }),
  // The anon / publishable key is PUBLIC by design (RLS is the real boundary).
  // It must NOT be a service_role / secret key — that would bypass RLS. Guard
  // against the most common catastrophic mistake (shipping the secret key).
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(20, 'EXPO_PUBLIC_SUPABASE_ANON_KEY is required')
    .refine((v) => !v.includes('service_role') && !v.startsWith('sb_secret_'), {
      error:
        'That looks like a SERVICE ROLE / secret key — never ship it in the app. Use the anon/publishable key; the service key bypasses RLS.',
    }),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse({
    EXPO_PUBLIC_API_URL: raw.EXPO_PUBLIC_API_URL ?? 'https://api.example.com',
    EXPO_PUBLIC_APP_ENV: raw.EXPO_PUBLIC_APP_ENV ?? 'development',
    EXPO_PUBLIC_SUPABASE_URL: raw.EXPO_PUBLIC_SUPABASE_URL ?? 'https://localhost.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY:
      raw.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'public-anon-key-placeholder',
  });

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\nSee .env.example`);
  }

  return result.data;
}

export const env: Env = parseEnv(process.env as Record<string, string | undefined>);
