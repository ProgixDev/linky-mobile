// Phase M.2 — Mint a Supabase-compatible JWT for Realtime authorization.
//
// Linky uses self-rolled JWT auth (LINKY_JWT_SECRET, validated via requireUser).
// Supabase Realtime, however, expects JWTs signed with the project's legacy
// HS256 JWT secret (Dashboard → Settings → API → JWT Settings → Legacy JWT
// Secret). This function bridges the two : auth via the caller's existing
// LINKY JWT, output a fresh Supabase-compatible JWT for realtime
// subscriptions.
//
// Body  : (none — caller's identity from JWT bearer)
// Response : { realtime_jwt: string, expires_in: number }
//
// Phase X.11 (2026-06-12) — renamed env var from SUPABASE_JWT_SECRET to
// LINKY_SB_JWT_SECRET. Supabase reserves the SUPABASE_ prefix for
// platform-injected secrets ; user-defined secrets with that prefix are
// silently rejected on set. The legacy variable name therefore returned
// undefined here even after the dashboard had a value set, surfacing as
// CONFIG_MISSING on every realtime mint attempt.
//
// If missing (never set yet, modern asymmetric-only project), function
// returns 500 with a CONFIG_MISSING code so mobile can surface a clear
// "realtime indisponible" state instead of an opaque crash. The mobile
// useConversations / useConversation hooks fall back to 30-60s polling
// when realtime is unavailable, so a missing secret is degraded UX, not a
// broken surface.
//
// Token TTL : 1 hour (REALTIME_TOKEN_TTL_SEC). Mobile (M.3) tracks expiry
// and re-mints before lapsing so live subscriptions never drop mid-session.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { signSupabaseRealtimeToken, REALTIME_TOKEN_TTL_SEC } from '@shared/jwt.ts';

interface Body { _?: never }

function valid(b: unknown): b is Body {
  return typeof b === 'object' && b !== null;
}

Deno.serve(makePost<Body>('/v1/realtime/mint-jwt', valid, async ({ req }) => {
  const userId = await requireUser(req);

  const secret = Deno.env.get('LINKY_SB_JWT_SECRET');
  if (!secret) {
    console.error('[mint-realtime-jwt] LINKY_SB_JWT_SECRET env var missing');
    throwApi('CONFIG_MISSING', 500, 'Configuration realtime indisponible.');
  }

  const { token } = await signSupabaseRealtimeToken(userId, secret);

  return {
    body: {
      realtime_jwt: token,
      expires_in: REALTIME_TOKEN_TTL_SEC,
    },
  };
}));
