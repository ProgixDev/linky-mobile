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
  // Mapbox PUBLIC access token (pk.) for runtime map tiles — public by design.
  // The secret download token (sk.) is build-time only and lives in the EAS env,
  // never here. Optional ('' when unset) so the app boots without a map config.
  EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN: z.string(),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse({
    EXPO_PUBLIC_API_URL: raw.EXPO_PUBLIC_API_URL ?? 'https://api.example.com',
    EXPO_PUBLIC_APP_ENV: raw.EXPO_PUBLIC_APP_ENV ?? 'development',
    EXPO_PUBLIC_SUPABASE_URL: raw.EXPO_PUBLIC_SUPABASE_URL ?? 'https://localhost.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY:
      raw.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'public-anon-key-placeholder',
    EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN: raw.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '',
  });

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\nSee .env.example`);
  }

  return result.data;
}

// IMPORTANT: each EXPO_PUBLIC_* MUST be referenced as a DIRECT
// `process.env.EXPO_PUBLIC_X` member expression. babel-preset-expo inlines those
// member expressions into string literals at bundle time — but it does NOT follow
// aliases: passing the whole `process.env` object (or `const raw = process.env`)
// inlines nothing, so in a release/standalone bundle every value fell back to the
// localhost/example placeholders → « connexion impossible » on device. Listing them
// explicitly is the only form Metro/Hermes actually bakes the live values into.
export const env: Env = parseEnv({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN: process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN,
});
