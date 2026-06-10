// Phase O.2 — mark ALL of the caller's unread notifications as read.
//
// Body : {}
// Response : { marked_count: number }
//
// Auth : requireUser. The notifications screen calls this on focus — coarse
// "mark all" matches the existing useMarkNotificationsRead() stub contract.
import { makePost } from '@shared/wrap.ts';
import { throwApi } from '@shared/errors.ts';
import { requireUser } from '@shared/auth.ts';

type Body = Record<string, never>;

function valid(b: unknown): b is Body {
  return typeof b === 'object' && b !== null;
}

Deno.serve(makePost<Body>('/v1/notifications/mark-read', valid, async ({ sb, req }) => {
  const userId = await requireUser(req);

  const { data, error } = await sb
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null)
    .select('id');

  if (error) {
    console.error('[mark-notifications-read] update error:', error);
    throwApi('INTERNAL_ERROR', 500, 'Erreur lors du marquage.');
  }

  return { body: { marked_count: data?.length ?? 0 } };
}));
