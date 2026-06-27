import { create } from 'zustand';

import { presentLocalNotification, setBadgeCount } from '@/shared/lib/push';

import {
  fetchNotifications,
  markNotificationsRead,
  type NotificationsPage,
} from '../lib/notifications-api';
import { type AppNotification, type NotificationCursor } from './schema';

type Status = 'idle' | 'loading' | 'refreshing' | 'loadingMore' | 'error';

/**
 * The in-app notifications inbox. Transient (never persisted) — the server is the
 * source of truth and is re-fetched on screen focus, on app foreground, and by the
 * foreground POLLER (every ~20s while open). `unreadCount` drives the nav bell badge
 * and the device app-icon badge.
 *
 * No-FCM real-time: when a refresh/poll surfaces a genuinely-new unread notification
 * (one absent from the previous first page) AFTER the baseline load, the store pops a
 * LOCAL notification (no push service needed) so a foreground courier sees the new
 * delivery as a system banner. `primed` guards the first load so opening the app never
 * re-announces the inbox it already had.
 */
type NotificationsState = {
  items: AppNotification[];
  unreadCount: number;
  status: Status;
  error: string | null;
  nextCursor: NotificationCursor | null;
  /** False until the first fetch sets a baseline (so the first load never pops banners). */
  primed: boolean;

  /** Initial / focus load (shows a skeleton only with nothing cached in memory). */
  load: () => Promise<void>;
  /** Re-fetch the first page (pull-to-refresh, foreground, poll). */
  refresh: () => Promise<void>;
  /** Append the next keyset page when scrolling. */
  loadMore: () => Promise<void>;
  /** Mark every unread as read (optimistic) + clear the badges. */
  markAllRead: () => Promise<void>;
  /** Wipe on sign-out so the next courier on this device starts clean. */
  reset: () => void;
};

export const useNotificationsStore = create<NotificationsState>()((set, get) => {
  // Merge a fresh FIRST page. After the baseline (`primed`), any unread notification
  // not present in the previous first page is genuinely new → pop a local banner so
  // the foreground courier is alerted without FCM. The inbox + badges update either way.
  function ingest(page: NotificationsPage): void {
    const prev = get();
    if (prev.primed) {
      const prevIds = new Set(prev.items.map((n) => n.id));
      for (const n of page.items) {
        if (!prevIds.has(n.id) && !n.read) {
          void presentLocalNotification({
            title: n.title,
            body: n.body,
            deeplink: n.deeplink,
            category: n.category,
          });
        }
      }
    }
    void setBadgeCount(page.unreadCount);
    set({
      items: page.items,
      unreadCount: page.unreadCount,
      nextCursor: page.nextCursor,
      status: 'idle',
      error: null,
      primed: true,
    });
  }

  return {
    items: [],
    unreadCount: 0,
    status: 'idle',
    error: null,
    nextCursor: null,
    primed: false,

    load: async () => {
      const { status, items } = get();
      if (status === 'loading' || status === 'refreshing') return;
      set({ status: items.length > 0 ? 'refreshing' : 'loading' });
      try {
        ingest(await fetchNotifications());
      } catch (e) {
        set({ status: 'error', error: e instanceof Error ? e.message : 'Erreur' });
      }
    },

    refresh: async () => {
      if (get().status === 'loading') return;
      set({ status: 'refreshing' });
      try {
        ingest(await fetchNotifications());
      } catch (e) {
        set({ status: 'error', error: e instanceof Error ? e.message : 'Erreur' });
      }
    },

    loadMore: async () => {
      const { status, nextCursor } = get();
      if (
        !nextCursor ||
        status === 'loading' ||
        status === 'refreshing' ||
        status === 'loadingMore'
      )
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
      set({
        items: [],
        unreadCount: 0,
        status: 'idle',
        error: null,
        nextCursor: null,
        primed: false,
      });
    },
  };
});

export const selectUnreadCount = (s: NotificationsState): number => s.unreadCount;
