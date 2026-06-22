import { z } from 'zod';

export const MessageSchema = z.object({
  id: z.string(),
  conversation_id: z.string(),
  sender_id: z.string(),
  body: z.string().min(1).max(4000),
  created_at: z.string(),
});
export type Message = z.infer<typeof MessageSchema>;

export const ConversationSchema = z.object({
  id: z.string(),
  created_by: z.string(),
  is_group: z.boolean(),
  title: z.string().nullable(),
  created_at: z.string(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

/** Validate a realtime/db row before trusting it (input at the edge). */
export function parseMessage(row: unknown): Message | null {
  const r = MessageSchema.safeParse(row);
  return r.success ? r.data : null;
}
