import { supabase } from '@/shared/lib/supabase';

import { ConversationSchema, MessageSchema, type Conversation, type Message } from '../model/chat';

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Conversations the current user belongs to (RLS scopes this to the user). */
export async function listConversations(): Promise<Result<Conversation[]>> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: ConversationSchema.array().parse(data ?? []) };
}

/** Messages in a conversation, oldest first. RLS blocks non-members. */
export async function getMessages(conversationId: string): Promise<Result<Message[]>> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: MessageSchema.array().parse(data ?? []) };
}

/** Send a message. sender_id defaults to auth.uid(); RLS enforces membership. */
export async function sendMessage(conversationId: string, body: string): Promise<Result<Message>> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: 'Message is empty.' };
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, body: trimmed })
    .select('*')
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: MessageSchema.parse(data) };
}

/** Start (or reuse) a 1:1 conversation with another user. */
export async function createDirectConversation(otherUserId: string): Promise<Result<string>> {
  const { data: conv, error } = await supabase
    .from('conversations')
    .insert({ is_group: false })
    .select('id')
    .single();
  if (error || !conv)
    return { ok: false, error: error?.message ?? 'Could not create conversation.' };

  const me = (await supabase.auth.getUser()).data.user;
  if (!me) return { ok: false, error: 'Not signed in.' };

  const { error: memberError } = await supabase.from('conversation_members').insert([
    { conversation_id: conv.id, user_id: me.id },
    { conversation_id: conv.id, user_id: otherUserId },
  ]);
  if (memberError) return { ok: false, error: memberError.message };
  return { ok: true, value: conv.id };
}

/** Mark the conversation read up to now (for unread badges). */
export async function markRead(conversationId: string): Promise<void> {
  const me = (await supabase.auth.getUser()).data.user;
  if (!me) return;
  await supabase
    .from('conversation_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', me.id);
}
