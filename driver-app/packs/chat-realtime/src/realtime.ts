import { supabase } from '@/shared/lib/supabase';

import { parseMessage, type Message } from './model/chat';

/**
 * Subscribe to new messages in a conversation over Supabase Realtime. RLS still
 * applies — a client only receives messages it's allowed to read. Returns an
 * unsubscribe function. No extra keys/services needed.
 */
export function subscribeToMessages(
  conversationId: string,
  onInsert: (message: Message) => void,
): () => void {
  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        const message = parseMessage(payload.new);
        if (message) onInsert(message);
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
