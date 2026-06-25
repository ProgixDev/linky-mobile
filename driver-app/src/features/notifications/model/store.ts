import { create } from 'zustand';

import { setBadgeCount } from '@/shared/lib/push';

import {
  fetchNotifications,
  markNotificationsRead,
  type NotificationsPage,
} from '../lib/notifications-api';
import { type AppNotification, type NotificationCursor } from './schema';

type Status = 'idle' | 'loading' | 'refreshing' | 'loadingMore' | 'error';

/**
 * The in-app notifications inbox. Transient (never persisted) — the server is the
 * source of truth and is re-fetched on screen focus, on app foreground, and when a
 * push arrives in the foreground. `unreadCount` drives the nav bell badge and the
 * device app-icon badge.
 */
type NotificationsState = {
  items: AppNotification[];
  unreadCount: number;
  status: Status;
  error: string | null;
  nextCursor: NotificationCursor | null;

  /** Initial / focus load (shows a skeleton only with nothing cached in memory). */
  load: () => Promise<void>;
  /** Re-fetch the first page (pull-to-refresh, foreground, incoming push). */
  refresh: () => Promise<void>;
  /** Append the next keyset page when scrolling. */
  loadMore: () => Promise<void>;
  /** Mark every unread as read (optimistic) + clear the badges. */
  markAllRead: () => Promise<void>;
  /** Wipe on sign-out so the next courier on this device starts clean. */
  reset: () => void;
};

function applyPage(page: NotificationsPage) {
  void setBadgeCount(page.unreadCount);
  return {
    items: page.items,
    unreadCount: page.unreadCount,
    nextCursor: page.nextCursor,
    status: 'idle' as const,
    error: null,
  };
}

export const useNotificationsStore = create<NotificationsState>()((set, get) => ({
  items: [],
  unreadCount: 0,
  status: 'idle',
  error: null,
  nextCursor: null,

  load: async () => {
    const { status, items } = get();
    if (status === 'loading' || status === 'refreshing') return;
    set({ status: items.length > 0 ? 'refreshing' : 'loading' });
    try {
      set(applyPage(await fetchNotifications()));
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : 'Erreur' });
    }
  },

  refresh: async () => {
    if (get().status === 'loading') return;
    set({ status: 'refreshing' });
    try {
      set(applyPage(await fetchNotifications()));
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : 'Erreur' });
    }
  },

  loadMore: async () => {
    const { status, nextCursor } = get();
    if (!nextCursor || status === 'loading' || status === 'refreshing' || status === 'loadingMore')
      return;
    set({ status: 'loadingMore' });
    try {
      const page = await fetchNotifications(nextCursor);
      void setBadgeCount(page.unreadCount);
      set((s) => ({
        items: [...s.items, ...page.items],
        unreadCount: page.unreadCount,
        nextCursor: page.nextCursor,
        status: 'idle',
        error: null,
      }));
    } catch {
      // A failed page-append must not blow away what's already shown.
      set({ status: 'idle' });
    }
  },

  markAllRead: async () => {
    const hadUnread = get().unreadCount > 0;
    // Optimistic: flip everything read + clear badges immediately.
    set((s) => ({ items: s.items.map((n) => ({ ...n, read: true })), unreadCount: 0 }));
    void setBadgeCount(0);
    if (!hadUnread) return;
    try {
      await markNotificationsRead();
    } catch {
      // The next refresh reconciles; a failed mark-read is not user-facing.
    }
  },

  reset: () => {
    void setBadgeCount(0);
    set({ items: [], unreadCount: 0, status: 'idle', error: null, nextCursor: null });
  },
}));

export const selectUnreadCount = (s: NotificationsState): number => s.unreadCount;
