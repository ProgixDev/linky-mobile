import { useCallback, useEffect, useState } from 'react';

import { getMessages, markRead, sendMessage } from './data/chat-repo';
import { type Message } from './model/chat';
import { subscribeToMessages } from './realtime';

/**
 * One conversation's live state: loads history, subscribes to new messages over
 * Realtime, marks read, and sends (optimistic, deduped by id). The UI just maps
 * `messages` and calls `send`.
 */
export function useConversation(conversationId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void getMessages(conversationId).then((r) => {
      if (!active) return;
      if (r.ok) setMessages(r.value);
      else setError(r.error);
      setLoading(false);
    });
    const unsubscribe = subscribeToMessages(conversationId, (m) => {
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    });
    void markRead(conversationId);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [conversationId]);

  const send = useCallback(
    async (body: string): Promise<boolean> => {
      const r = await sendMessage(conversationId, body);
      if (!r.ok) {
        setError(r.error);
        return false;
      }
      setMessages((prev) => (prev.some((x) => x.id === r.value.id) ? prev : [...prev, r.value]));
      return true;
    },
    [conversationId],
  );

  return { messages, loading, error, send };
}
