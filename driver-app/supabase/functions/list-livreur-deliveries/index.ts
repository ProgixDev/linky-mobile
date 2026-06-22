// Returns the signed-in driver's ACTIVE deliveries (status assigned/in_transit),
// newest first, joined with the order's item + shop + dropoff AREA (city/district).
//
// Security (spec 001 AC-9): the driver identity is taken ONLY from the verified
// JWT (`getUser()`), never from the request body — a client cannot ask for another
// driver's deliveries. `deliveries` has RLS enabled with no client policies, so the
// read runs with the service_role and is scoped here by `livreur_id = <jwt user>`.
//
// Privacy (AC-10): the street-level `details` field of delivery_address is NOT
// returned — only city/district. The full address is revealed at the handoff step.
//
// NOTE: Deno edge function — excluded from `npm run verify` (RN toolchain). Verify
// with `deno check` and a manual `functions.invoke` against a seeded livreur.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const ACTIVE_STATUSES = ['assigned', 'in_transit'];

type DeliveryRow = {
  id: string;
  status: string;
  created_at: string;
  delivery_address: { city?: string; district?: string } | null;
  orders: {
    reference: string | null;
    product_snapshot: { title?: string; photo?: string } | null;
    shops: { name?: string } | null;
  } | null;
};

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return new Response('unauthorized', { status: 401 });
  }

  // Identify the caller from their JWT (network-verified). This is the ONLY source
  // of the driver id — there is no client-supplied identity.
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

  // Read with service_role (deliveries has no client RLS policy) but scope strictly
  // to this driver + active statuses, newest first.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin
    .from('deliveries')
    .select(
      'id, status, created_at, delivery_address, orders ( reference, product_snapshot, shops ( name ) )',
    )
    .eq('livreur_id', user.id)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false });

  if (error) {
    // Log server-side so failures are diagnosable; never leak internals to the client.
    console.error('list-livreur-deliveries query failed', error);
    return new Response(JSON.stringify({ error: 'query_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const deliveries = ((data ?? []) as DeliveryRow[]).map((row) => ({
    id: row.id,
    orderRef: row.orders?.reference ?? '',
    itemTitle: row.orders?.product_snapshot?.title ?? '',
    itemPhoto: row.orders?.product_snapshot?.photo ?? '',
    shopName: row.orders?.shops?.name ?? '',
    dropoffCity: row.delivery_address?.city ?? '',
    dropoffDistrict: row.delivery_address?.district ?? '',
    status: row.status,
    createdAt: Date.parse(row.created_at) || 0,
  }));

  return new Response(JSON.stringify(deliveries), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
