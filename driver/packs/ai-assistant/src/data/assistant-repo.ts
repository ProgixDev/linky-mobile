import { supabase } from '@/shared/lib/supabase';

import { AiMessageSchema, AiConversationSchema, type AiMessage, type AiConversation } from '../model/chat';

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Create a new conversation for the current user (RLS: own rows). */
export async function createConversation(title?: string): Promise<Result<string>> {
  const { data, error } = await supabase
    .from('ai_conversations')
    .insert({ title: title ?? null })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'Could not start a chat.' };
  return { ok: true, value: data.id };
}

/** The current user's conversations, newest first. */
export async function listConversations(): Promise<Result<AiConversation[]>> {
  const { data, error } = await supabase
    .from('ai_conversations')
    .select('id, title, created_at')
    .order('created_at', { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: (data ?? []).map((c) => AiConversationSchema.parse(c)) };
}

/** Messages in a conversation, oldest first (RLS: own rows). */
export async function getMessages(conversationId: string): Promise<Result<AiMessage[]>> {
  const { data, error } = await supabase
    .from('ai_messages')
    .select('id, conversation_id, role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: (data ?? []).map((m) => AiMessageSchema.parse(m)) };
}

/** Persist one message. user_id defaults to auth.uid() via the table default. */
export async function insertMessage(
  conversationId: string,
  role: AiMessage['role'],
  content: string,
): Promise<void> {
  await supabase.from('ai_messages').insert({ conversation_id: conversationId, role, content });
}
