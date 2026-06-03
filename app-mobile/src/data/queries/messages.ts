import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Conversation, Message, AppNotification } from '../types';

// Messaging backend not yet implemented. Until the /v1/messages endpoint ships,
// every query returns an empty result so the UI shows real empty states instead
// of a fake inbox. Mutations are no-ops that resolve cleanly so callers don't
// crash.

export function useConversations() {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: async (): Promise<Conversation[]> => [],
  });
}

export function useConversation(id: string | undefined) {
  return useQuery({
    queryKey: ['conversation', id],
    enabled: !!id,
    queryFn: async (): Promise<{ conversation: Conversation | undefined; messages: Message[] }> => ({
      conversation: undefined,
      messages: [],
    }),
  });
}

export function useSendMessage(conversationId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (_body: string): Promise<Message | null> => null,
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
    queryFn: async (): Promise<AppNotification[]> => [],
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {},
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
