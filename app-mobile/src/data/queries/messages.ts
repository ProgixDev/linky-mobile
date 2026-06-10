// Wired to live edge functions + Supabase Realtime channels :
//   list-conversations, get-conversation, send-message, mark-read.
// Realtime broadcasts via postgres_changes (M.1 RLS authorizes per-user).
// Polling intervals (60s list / 30s detail) act as safety net when the
// WebSocket is unavailable (network issue, JWT expiry, etc).

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';
import { getRealtimeClient, ensureRealtimeAuth } from '../../lib/realtime';
import { useAuth } from '../../stores/auth';
import type { Conversation, Message, AppNotification } from '../types';

interface ConvListResponse {
  conversations: Conversation[];
  next_cursor: { last_message_at: string; id: string } | null;
}

interface ConvDetailResponse {
  conversation: Conversation;
  messages: Message[];
  next_cursor: { created_at: string; id: string } | null;
}

interface SendMessageResponse {
  message: Message;
  conversationId: string;
  isNewConversation: boolean;
}

interface MarkReadResponse {
  marked_count: number;
}

export function useConversations() {
  const qc = useQueryClient();
  const me = useAuth((s) => s.authUserId);

  // Realtime : subscribe to all conversations changes. RLS (M.1) filters
  // server-side to the caller's own convs, so we trust the broadcast and
  // simply invalidate the cache on any event.
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    let channel: ReturnType<ReturnType<typeof getRealtimeClient>['channel']> | null = null;

    (async () => {
      try {
        await ensureRealtimeAuth();
        if (cancelled) return;
        channel = getRealtimeClient()
          .channel(`linky:conversations:${me}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'conversations' },
            () => {
              qc.invalidateQueries({ queryKey: ['conversations'] });
            },
          )
          .subscribe();
      } catch (e) {
        // Realtime unavailable → polling fallback below handles updates.
        console.warn('[realtime] conversations subscription failed:', e);
      }
    })();

    return () => {
      cancelled = true;
      if (channel) {
        getRealtimeClient().removeChannel(channel);
      }
    };
  }, [me, qc]);

  return useQuery({
    queryKey: ['conversations'],
    queryFn: async (): Promise<Conversation[]> => {
      const r = await apiPost<ConvListResponse>({
        path: '/list-conversations',
        body: {},
      });
      return r.conversations;
    },
    // Polling as safety net when realtime is unavailable (no network for
    // WebSocket, JWT expired, RLS misconfigured). 60s is conservative
    // because realtime should normally handle freshness instantly.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useConversation(id: string | undefined) {
  const qc = useQueryClient();

  // Realtime : subscribe to INSERT only on messages of this conversation.
  // UPDATE (mark-read) and DELETE aren't actionable for V1 chat UX, so
  // we narrow to INSERT and avoid spurious re-renders.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let channel: ReturnType<ReturnType<typeof getRealtimeClient>['channel']> | null = null;

    (async () => {
      try {
        await ensureRealtimeAuth();
        if (cancelled) return;
        channel = getRealtimeClient()
          .channel(`linky:messages:${id}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'messages',
              filter: `conversation_id=eq.${id}`,
            },
            () => {
              qc.invalidateQueries({ queryKey: ['conversation', id] });
            },
          )
          .subscribe();
      } catch (e) {
        console.warn('[realtime] conversation subscription failed:', e);
      }
    })();

    return () => {
      cancelled = true;
      if (channel) {
        getRealtimeClient().removeChannel(channel);
      }
    };
  }, [id, qc]);

  return useQuery({
    queryKey: ['conversation', id],
    enabled: !!id,
    queryFn: async (): Promise<{ conversation: Conversation | undefined; messages: Message[] }> => {
      if (!id) return { conversation: undefined, messages: [] };
      const r = await apiPost<ConvDetailResponse>({
        path: '/get-conversation',
        body: { conversation_id: id },
      });
      // Messages arrive newest-first from the server; the UI renders oldest-first
      // so we reverse here. Saves the screen having to think about it.
      return { conversation: r.conversation, messages: [...r.messages].reverse() };
    },
    // Polling as safety net (same rationale as useConversations).
    // 30s instead of 60s because the chat detail screen is interactive
    // and freshness matters more here.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

interface SendMessageInput {
  body: string;
  conversationId?: string;
  recipientId?: string;
  pinnedKind?: 'product' | 'property';
  pinnedId?: string;
}

export function useSendMessage(conversationId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SendMessageInput | string): Promise<Message> => {
      // Backwards-compat overload : the existing chat screen passes a raw string
      // for convenience. Wrap it with the current conversationId.
      const params: SendMessageInput = typeof input === 'string'
        ? { body: input, conversationId }
        : input;

      const apiBody: Record<string, unknown> = { body: params.body };
      if (params.conversationId) apiBody.conversation_id = params.conversationId;
      else if (params.recipientId) apiBody.recipient_id = params.recipientId;
      if (params.pinnedKind && params.pinnedId) {
        apiBody.pinned_kind = params.pinnedKind;
        apiBody.pinned_id = params.pinnedId;
      }

      const r = await apiPost<SendMessageResponse>({
        path: '/send-message',
        body: apiBody,
      });
      return r.message;
    },
    onSuccess: (msg) => {
      qc.invalidateQueries({ queryKey: ['conversation', msg.conversationId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useMarkConversationRead(conversationId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      if (!conversationId) return 0;
      const r = await apiPost<MarkReadResponse>({
        path: '/mark-read',
        body: { conversation_id: conversationId },
      });
      return r.marked_count;
    },
    onSuccess: (markedCount) => {
      if (markedCount > 0 && conversationId) {
        qc.invalidateQueries({ queryKey: ['conversation', conversationId] });
        qc.invalidateQueries({ queryKey: ['conversations'] });
      }
    },
  });
}

interface FindOrCreateInput {
  recipient_id: string;
  pinned_kind?: 'product' | 'property';
  pinned_id?: string;
}

interface FindOrCreateResponse {
  conversation_id: string;
  is_new_conversation: boolean;
}

export function useFindOrCreateConversation() {
  return useMutation({
    mutationFn: async (input: FindOrCreateInput): Promise<FindOrCreateResponse> => {
      const body: Record<string, unknown> = { recipient_id: input.recipient_id };
      if (input.pinned_kind && input.pinned_id) {
        body.pinned_kind = input.pinned_kind;
        body.pinned_id = input.pinned_id;
      }
      return await apiPost<FindOrCreateResponse>({
        path: '/find-or-create-conversation',
        body,
      });
    },
  });
}

// Phase O — wired to list-notifications / mark-notifications-read.
interface NotificationRowWire {
  id: string;
  category: AppNotification['category'];
  title: string;
  body: string;
  icon_hint: string;
  deeplink: string | null;
  read_at: string | null;
  created_at: string;
}

interface ListNotificationsResponse {
  notifications: NotificationRowWire[];
  next_cursor: { created_at: string; id: string } | null;
  unread_count: number;
}

interface NotificationsFeed {
  items: AppNotification[];
  unreadCount: number;
}

// One fetch, one cache entry (['notifications']) — the screen and the bell
// dots are `select` views over the same data, so invalidating the key after
// mark-notifications-read refreshes both.
async function fetchNotificationsFeed(): Promise<NotificationsFeed> {
  const r = await apiPost<ListNotificationsResponse>({
    path: '/list-notifications',
    body: {},
  });
  return {
    items: r.notifications.map((n) => ({
      id: n.id,
      category: n.category,
      title: n.title,
      body: n.body,
      at: n.created_at,
      read: n.read_at !== null,
      iconHint: n.icon_hint,
    })),
    unreadCount: r.unread_count,
  };
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotificationsFeed,
    select: (d) => d.items,
  });
}

export function useUnreadNotificationsCount() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotificationsFeed,
    select: (d) => d.unreadCount,
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const r = await apiPost<{ marked_count: number }>({
        path: '/mark-notifications-read',
        body: {},
      });
      return r.marked_count;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
