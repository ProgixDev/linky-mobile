// Phase O.2 — best-effort push dispatch via the Expo Push API.
//
// notify() does two things, in order :
//   1. inserts one public.notifications row per recipient (durable, feeds the
//      in-app screen + acts as audit trail of what was sent) ;
//   2. sends an Expo push to every registered device of the recipients
//      (best-effort, fire-and-forget semantics).
//
// It NEVER throws : a push failure must not fail the business endpoint that
// triggered it. All errors are logged and swallowed.
//
// Tokens Expo reports as DeviceNotRegistered are deleted, so push_tokens
// self-heals as users uninstall or change devices.
//
// LINKY_EXPO_PUSH_TOKEN (optional secret) : Expo "enhanced push security"
// access token. Sent as bearer when present ; pushes work without it as long
// as enhanced security stays off for the EAS project.

import type { SupabaseClient } from '@shared/db.ts';

export type NotifyCategory = 'order' | 'message' | 'visit' | 'promo' | 'system';

export interface NotifyInput {
  userIds: string[];
  category: NotifyCategory;
  title: string;
  body: string;
  /** ICON_FOR keys in app/notifications.tsx : check | msg | bolt | star | heart | shield */
  iconHint?: string;
  /** expo-router path the app navigates to on tap, e.g. '/order/LK-2026-10027' */
  deeplink?: string;
  refType?: 'order' | 'conversation' | 'visit_request';
  refId?: string;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK = 100; // Expo hard limit per request

interface ExpoTicket {
  status: 'ok' | 'error';
  details?: { error?: string };
}

export async function notify(sb: SupabaseClient, input: NotifyInput): Promise<void> {
  try {
    const userIds = [...new Set(input.userIds)].filter(Boolean);
    if (userIds.length === 0) return;

    const { error: insErr } = await sb.from('notifications').insert(
      userIds.map((uid) => ({
        user_id: uid,
        category: input.category,
        title: input.title,
        body: input.body,
        icon_hint: input.iconHint ?? 'info',
        deeplink: input.deeplink ?? null,
        ref_type: input.refType ?? null,
        ref_id: input.refId ?? null,
      })),
    );
    if (insErr) console.error('[push] notifications insert failed:', insErr);

    const { data: tokens, error: tokErr } = await sb
      .from('push_tokens')
      .select('token')
      .in('user_id', userIds);
    if (tokErr) {
      console.error('[push] token fetch failed:', tokErr);
      return;
    }
    if (!tokens?.length) return;

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json',
    };
    const accessToken = Deno.env.get('LINKY_EXPO_PUSH_TOKEN');
    if (accessToken) headers.authorization = `Bearer ${accessToken}`;

    const messages = tokens.map((t) => ({
      to: t.token,
      title: input.title,
      body: input.body,
      sound: 'default',
      data: { deeplink: input.deeplink ?? null, category: input.category },
    }));

    for (let i = 0; i < messages.length; i += CHUNK) {
      const chunk = messages.slice(i, i + CHUNK);
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(chunk),
      });
      if (!res.ok) {
        console.error('[push] expo push HTTP', res.status, await res.text().catch(() => ''));
        continue;
      }
      const json = (await res.json().catch(() => null)) as { data?: ExpoTicket[] } | null;
      const dead = (json?.data ?? [])
        .map((ticket, idx) => (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered' ? chunk[idx].to : null))
        .filter((t): t is string => t !== null);
      if (dead.length > 0) {
        const { error: delErr } = await sb.from('push_tokens').delete().in('token', dead);
        if (delErr) console.error('[push] dead token cleanup failed:', delErr);
        else console.log(`[push] pruned ${dead.length} dead token(s)`);
      }
    }
  } catch (e) {
    console.error('[push] notify failed:', e);
  }
}

// Respond to the caller without waiting on Expo. EdgeRuntime.waitUntil keeps
// the isolate alive until the dispatch settles ; if unavailable (local deno
// test runs), the floating promise still can't reject — notify catches all.
export function notifyDetached(sb: SupabaseClient, input: NotifyInput): void {
  const p = notify(sb, input);
  const rt = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p);
}

// Display name lookup for notification copy. Falls back to a neutral label —
// copy must stay sensible when display_name is null (pre-profile-setup users).
export async function displayNameOf(sb: SupabaseClient, userId: string): Promise<string> {
  const { data } = await sb.from('users').select('display_name').eq('id', userId).maybeSingle();
  return (data?.display_name as string | null) ?? 'Un utilisateur Linky';
}

// Mirrors src/lib/format.ts formatGNF on mobile. GNF has no decimals :
// amount_minor === whole francs (see wallet.ts mapping amountGnf = amount_minor).
const frNumber = new Intl.NumberFormat('fr-FR');
export function formatGNF(amount: number): string {
  return `${frNumber.format(Math.round(amount))} GNF`;
}
