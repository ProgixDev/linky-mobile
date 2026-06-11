// Final sprint §2 — real KPI counts for the admin overview page.
// One RPC round-trip (public.admin_overview, 20260611_02). Numbers only.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';

type Body = Record<string, never>;

function valid(b: unknown): b is Body {
  return typeof b === 'object' && b !== null;
}

Deno.serve(makePost<Body>('/v1/admin/overview', valid, async ({ sb, req }) => {
  const userId = await requireUser(req);
  await assertAdmin(sb, userId);

  const { data, error } = await sb.rpc('admin_overview');
  if (error || !data) {
    console.error('[admin-overview] rpc error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  const row = Array.isArray(data) ? data[0] : data;
  return { body: { overview: row } };
}));
