import { z } from 'zod';

export const AiMessageSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1),
  created_at: z.string(),
});
export type AiMessage = z.infer<typeof AiMessageSchema>;

export const AiConversationSchema = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  created_at: z.string(),
});
export type AiConversation = z.infer<typeof AiConversationSchema>;

/** What we send upstream — only role + content (no ids/timestamps). */
export type ChatTurn = { role: AiMessage['role']; content: string };
