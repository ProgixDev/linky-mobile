import { supabase } from '@/shared/lib/supabase';

import { NotificationSchema, type Notification } from '../model/notification';

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** The current user's notifications, newest first (RLS: own rows). */
export async function listNotifications(limit = 50): Promise<Result<Notification[]>> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, user_id, actor_id, type, body, entity, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: (data ?? []).map((n) => NotificationSchema.parse(n)) };
}

/** Count of unread notifications (for the badge). */
export async function unreadCount(): Promise<number> {
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  return count ?? 0;
}

export async function markRead(id: string): Promise<void> {
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
}

export async function markAllRead(): Promise<void> {
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);
}

/**
 * Create a notification for another user. The current user is stamped as the
 * actor (RLS requires it). Use when something happens: a like, a follow, a reply.
 */
export async function notify(
  targetUserId: string,
  type: string,
  body: string,
  entity?: string,
): Promise<void> {
  const me = (await supabase.auth.getUser()).data.user;
  if (!me) return;
  await supabase.from('notifications').insert({
    user_id: targetUserId,
    actor_id: me.id,
    type,
    body,
    entity: entity ?? null,
  });
}
