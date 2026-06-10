const DEFAULT_ORIGINS = [
  'http://localhost:8081',
  'http://localhost:3000',
  'http://localhost:19006',
  'https://linky.app',
  'https://linky-admin.vercel.app',
];

const ALLOWED_ORIGINS = (Deno.env.get('LINKY_ALLOWED_ORIGINS') ?? DEFAULT_ORIGINS.join(','))
  .split(',').map((s) => s.trim()).filter(Boolean);

const FALLBACK_ORIGIN = ALLOWED_ORIGINS[0] ?? 'null';

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : FALLBACK_ORIGIN;
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, idempotency-key',
    'access-control-max-age': '86400',
    'vary': 'origin',
  };
}

export function handlePreflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}
