// In-app account deletion. Apple Guideline 5.1.1(v) and Google Play both REQUIRE
// an in-app path to fully delete the account + its data. (Store-readiness: STORE-ACCT-DELETE.)
//
// Security: the platform validates the caller's JWT (verify_jwt = true, the
// default). We re-derive the user from their token, then delete with the
// service_role admin API. FKs to auth.users use ON DELETE CASCADE, so the user's
// rows (profiles, notes, subscriptions) are removed with them.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return new Response('unauthorized', { status: 401 });
  }

  // Identify the caller from their JWT (network-verified).
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return new Response('unauthorized', { status: 401 });
  }

  // Delete with admin privileges.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return new Response('error', { status: 500 });
  }

  return new Response('ok', { status: 200 });
});
