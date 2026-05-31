import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mockConversations, mockMessagesByConversation, mockNotifications } from '../mockConversations';
import type { Conversation, Message, AppNotification } from '../types';
import { latency } from './latency';
// dev-fixture: messages backend not yet implemented. CURRENT_USER_ID used to
// stamp outgoing senderId until a real /v1/messages endpoint ships and reads
// caller_id from the JWT. Remove this import when that lands.
import { CURRENT_USER_ID } from '../mockUsers';

const conversations: Conversation[] = [...mockConversations];
const messagesByConv: Record<string, Message[]> = { ...mockMessagesByConversation };
const notifications: AppNotification[] = [...mockNotifications];

export function useConversations() {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: async (): Promise<Conversation[]> => {
      await latency();
      return conversations;
    },
  });
}

export function useConversation(id: string | undefined) {
  return useQuery({
    queryKey: ['conversation', id],
    enabled: !!id,
    queryFn: async () => {
      await latency();
      const conv = conversations.find((c) => c.id === id);
      const msgs = messagesByConv[id as string] ?? [];
      return { conversation: conv, messages: msgs };
    },
  });
}

export function useSendMessage(conversationId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      await new Promise((r) => setTimeout(r, 80));
      if (!conversationId) return null;
      const msg: Message = {
        id: `m_${Date.now()}`,
        conversationId,
        senderId: CURRENT_USER_ID,
        body,
        at: new Date().toISOString(),
        seen: false,
      };
      messagesByConv[conversationId] = [...(messagesByConv[conversationId] ?? []), msg];
      const convIdx = conversations.findIndex((c) => c.id === conversationId);
      if (convIdx >= 0) {
        const c = conversations[convIdx]!;
        conversations[convIdx] = { ...c, lastMessage: `Tu : ${body}`, lastAt: msg.at, unread: 0 };
      }
      return msg;
    },
    onSuccess: () => {
      if (conversationId) {
        qc.invalidateQueries({ queryKey: ['conversation', conversationId] });
        qc.invalidateQueries({ queryKey: ['conversations'] });
      }
    },
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async (): Promise<AppNotification[]> => {
      await latency();
      return notifications;
    },
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      for (const n of notifications) n.read = true;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
