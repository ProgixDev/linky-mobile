import { useCallback, useEffect, useRef, useState } from 'react';

import { createConversation, getMessages, insertMessage } from './data/assistant-repo';
import { type AiMessage, type ChatTurn } from './model/chat';
import { streamReply } from './services/chat-stream';

type UiMessage = { role: AiMessage['role']; content: string };

/**
 * Drives a single assistant conversation: loads history, sends a turn, streams
 * the reply token-by-token into the last message, and persists both sides.
 * Creates a conversation lazily on the first send if none was passed.
 */
export function useAssistant(initialConversationId?: string) {
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId ?? null,
  );
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const convRef = useRef(conversationId);
  convRef.current = conversationId;

  useEffect(() => {
    if (!initialConversationId) return;
    void (async () => {
      const r = await getMessages(initialConversationId);
      if (r.ok) setMessages(r.value.map((m) => ({ role: m.role, content: m.content })));
    })();
  }, [initialConversationId]);

  const send = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || streaming) return;
    setError(null);

    // Ensure a conversation exists.
    let convId = convRef.current;
    if (!convId) {
      const created = await createConversation(content.slice(0, 60));
      if (!created.ok) return setError(created.error);
      convId = created.value;
      setConversationId(convId);
    }

    const history: ChatTurn[] = [...messages, { role: 'user', content }].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages((prev) => [...prev, { role: 'user', content }, { role: 'assistant', content: '' }]);
    await insertMessage(convId, 'user', content);

    setStreaming(true);
    let assembled = '';
    for await (const delta of streamReply(history, setError)) {
      assembled += delta;
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content: assembled };
        return next;
      });
    }
    setStreaming(false);

    if (assembled) await insertMessage(convId, 'assistant', assembled);
  }, [messages, streaming]);

  return { conversationId, messages, streaming, error, send };
}
