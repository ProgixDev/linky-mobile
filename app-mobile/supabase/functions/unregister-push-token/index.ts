// Phase O.2 — unregister a push token on logout.
//
// Body : { token: string }
// Response : { unregistered: boolean } — false when the token wasn't found
// (already pruned, or owned by another account) ; not an error, logout must
// never be blocked by push state.
//
// Auth : requireUser. Delete is scoped to the caller's own row.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

interface Body {
  token: string;
}

const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[.+\]$/;

function valid(b: unknown): b is Body {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  return typeof x.token === 'string' && x.token.length <= 200 && EXPO_TOKEN_RE.test(x.token);
}

Deno.serve(makePost<Body>('/v1/push/unregister-token', valid, async ({ sb, body, req }) => {
  const userId = await requireUser(req);

  const { data, error } = await sb
    .from('push_tokens')
    .delete()
    .eq('token', body.token)
    .eq('user_id', userId)
    .select('id');
  if (error) {
    console.error('[unregister-push-token] delete error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lors de la désinscription.');
  }

  return { body: { unregistered: (data?.length ?? 0) > 0 } };
}));
