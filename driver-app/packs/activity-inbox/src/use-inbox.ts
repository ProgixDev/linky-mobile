import { useEffect, useState } from 'react';

import { supabase } from '@/shared/lib/supabase';

import {
  listNotifications,
  markAllRead,
  markRead,
  unreadCount,
} from './data/notifications-repo';
import { NotificationSchema, type Notification } from './model/notification';

/**
 * The inbox: loads notifications + unread count, and subscribes to Realtime so a
 * new notification appears (and bumps the badge) without a refresh.
 */
export function useInbox() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const [list, count] = await Promise.all([listNotifications(), unreadCount()]);
    if (list.ok) setItems(list.value);
    setUnread(count);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    const me = supabase.auth.getUser();
    const channel = supabase
      .channel('inbox')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          const parsed = NotificationSchema.safeParse(payload.new);
          if (parsed.success) {
            setItems((prev) => [parsed.data, ...prev]);
            setUnread((u) => u + 1);
          }
        },
      )
      .subscribe();
    void me;
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const open = async (n: Notification) => {
    if (!n.read_at) {
      await markRead(n.id);
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      setUnread((u) => Math.max(0, u - 1));
    }
  };

  const readAll = async () => {
    await markAllRead();
    setItems((prev) => prev.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
    setUnread(0);
  };

  return { items, unread, loading, open, readAll, refresh };
}
