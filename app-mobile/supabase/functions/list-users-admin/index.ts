// Final sprint §2 — admin users table (READ-ONLY, no mutations in V1).
// Body : { search?: string } — case-insensitive match on display_name.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';
import { assertAdmin } from '@shared/admin.ts';

interface Body {
  search?: string;
}

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  return x.search === undefined || (typeof x.search === 'string' && x.search.length <= 80);
}

Deno.serve(makePost<Body>('/v1/admin/users/list', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);
  await assertAdmin(sb, userId);

  let q = sb.from('users')
    .select('id, display_name, avatar_url, kyc_status, is_admin, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  const search = body.search?.trim();
  if (search) {
    // Escape PostgREST ilike wildcards so user input can't widen the match.
    q = q.ilike('display_name', `%${search.replace(/[%_]/g, '\\$&')}%`);
  }

  const { data, error } = await q;
  if (error) {
    console.error('[list-users-admin] select error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur base de données');
  }

  return { body: { users: data ?? [] } };
}));
