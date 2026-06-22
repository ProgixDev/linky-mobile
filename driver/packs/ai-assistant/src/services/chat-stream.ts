// Streaming uses fetch from 'expo/fetch', which (unlike React Native's global
// fetch) exposes response.body as a ReadableStream on device. SDK 52+.
import { fetch as expoFetch } from 'expo/fetch';

import { env } from '@/shared/lib/env';
import { logger } from '@/shared/lib/logger';
import { supabase } from '@/shared/lib/supabase';

import { type ChatTurn } from '../model/chat';

const FUNCTION_URL = `${env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/ai-chat`;

/**
 * Stream an assistant reply for the given turns. Yields text deltas as they
 * arrive from the Edge Function (which holds the model key server-side). The
 * caller appends each delta to the visible message. Never throws — yields an
 * error sentinel string only via onError.
 */
export async function* streamReply(
  messages: ChatTurn[],
  onError?: (message: string) => void,
): AsyncGenerator<string> {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) {
    onError?.('Sign in to use the assistant.');
    return;
  }

  let res: Awaited<ReturnType<typeof expoFetch>>;
  try {
    res = await expoFetch(FUNCTION_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });
  } catch (err) {
    logger.warn('assistant: request failed', { err });
    onError?.('Could not reach the assistant. Check your connection.');
    return;
  }

  if (!res.ok || !res.body) {
    onError?.('The assistant is unavailable right now.');
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) yield chunk;
  }
}
