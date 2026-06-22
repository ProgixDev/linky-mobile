// RevenueCat webhook → updates the server-owned entitlement row.
//
// Security model (see docs/research/06-payments-analytics-stack.md):
//   * verify_jwt = false (RevenueCat sends no Supabase JWT) — set in config.toml.
//   * RevenueCat does NOT sign bodies, so the ONLY auth is the Authorization
//     header shared secret you configure in the RevenueCat dashboard. Verify it.
//   * Writes use the SERVICE ROLE key (bypasses RLS) — server-only, from env.
//   * Idempotent: upsert on user_id; webhooks are delivered at-least-once.
//   * Configure RevenueCat appUserID = the Supabase user id so app_user_id maps.
//
// Deno runtime (Supabase Edge Functions).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const WEBHOOK_SECRET = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const ACTIVE_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'SUBSCRIPTION_EXTENDED',
  'PRODUCT_CHANGE',
  'NON_RENEWING_PURCHASE',
]);

Deno.serve(async (req) => {
  // Auth: constant-string compare against the shared secret.
  const auth = req.headers.get('Authorization') ?? '';
  if (!WEBHOOK_SECRET || auth !== `Bearer ${WEBHOOK_SECRET}`) {
    return new Response('unauthorized', { status: 401 });
  }

  let event: Record<string, unknown> | undefined;
  try {
    const payload = await req.json();
    event = payload?.event;
  } catch {
    return new Response('bad request', { status: 400 });
  }

  const appUserId = event?.app_user_id as string | undefined;
  const type = event?.type as string | undefined;
  if (!appUserId || !type) return new Response('bad request', { status: 400 });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const expirationMs = event?.expiration_at_ms as number | undefined;
  const { error } = await admin.from('subscriptions').upsert(
    {
      user_id: appUserId,
      status: ACTIVE_EVENTS.has(type) ? 'active' : 'inactive',
      product_id: (event?.product_id as string | undefined) ?? null,
      current_period_end: expirationMs ? new Date(expirationMs).toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (error) return new Response('error', { status: 500 });
  return new Response('ok', { status: 200 });
});
