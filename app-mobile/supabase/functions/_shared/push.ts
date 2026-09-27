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
import {
  channelIdFor,
  iosSoundFor,
  DECISION_CATEGORY_ID,
  type NotifyKind,
} from '@shared/notify-kinds.ts';

export type { NotifyKind };

export type NotifyCategory = 'order' | 'message' | 'visit' | 'promo' | 'system' | 'booking';

/**
 * LA CATEGORIE DIT LE DOMAINE, LE `kind` DIT LE TON.
 *
 * `category` existe depuis le debut et pilote la boite in-app (icone, filtre) :
 * elle range une notification par sujet — commande, reservation, message. Elle
 * ne dit PAS si l'evenement est une bonne ou une mauvaise nouvelle, or c'est
 * exactement ce que le client demande d'entendre : un son pour ce qui aboutit,
 * un autre pour ce qui echoue.
 *
 * On ne touche donc pas a `category` (34 appels et la boite in-app en dependent)
 * et on ajoute `kind`, qui choisit le canal Android, le son iOS, la priorite et
 * la vibration. Non renseigne, il se deduit de la categorie : les appels
 * existants gardent un comportement sense sans etre tous reecrits.
 */
const KIND_FROM_CATEGORY: Record<NotifyCategory, NotifyKind> = {
  order: 'order',
  booking: 'booking',
  message: 'message',
  visit: 'info',
  promo: 'info',
  system: 'info',
};

/** Which app's device tokens a push targets. Mirrors push_tokens.app. */
export type NotifyApp = 'marketplace' | 'driver';

export interface NotifyInput {
  userIds: string[];
  category: NotifyCategory;
  title: string;
  body: string;
  /** ICON_FOR keys in app/notifications.tsx : check | msg | bolt | star | heart | shield */
  iconHint?: string;
  /** expo-router path the app navigates to on tap, e.g. '/order/LK-2026-10027' */
  deeplink?: string;
  refType?: 'order' | 'conversation' | 'visit_request' | 'booking' | 'boost';
  refId?: string;
  /**
   * Restrict the Expo push to tokens registered by THIS app (push_tokens.app).
   * A user who is both a marketplace user and a livreur has tokens for both apps
   * under one user_id; a livreur-only push must set `app: 'driver'` so it never
   * reaches the marketplace app. UNSET = all apps (backward-compatible — the
   * durable notifications row is always written for every recipient regardless).
   */
  app?: NotifyApp;
  /**
   * Le TON de l'evenement : il choisit le canal Android (donc le son et la
   * vibration), le son iOS et la priorite d'acheminement. Absent = deduit de
   * `category`.
   */
  kind?: NotifyKind;
  /**
   * Vrai quand la notification porte une DEMANDE que le destinataire doit
   * trancher : elle affiche alors les deux boutons Accepter / Refuser, qui
   * ouvrent l'ecran de decision.
   *
   * A ne poser QUE s'il existe vraiment un endroit ou trancher. Un bouton
   * « Accepter » qui ouvre un ecran sans decision est pire que pas de bouton.
   */
  decision?: boolean;
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
        // Which app this notification is FOR. The driver inbox shows app='driver'
        // only; the marketplace inbox excludes it — a user can be both buyer/seller
        // AND livreur on one account, so each app must see only its own notifications.
        app: input.app ?? 'marketplace',
      })),
    );
    if (insErr) console.error('[push] notifications insert failed:', insErr);

    // The in-app notifications rows above are written for EVERY recipient
    // regardless of `app` (the in-app inbox is per-user, app-agnostic). Only the
    // Expo device push is scoped to one app's tokens when `app` is set.
    // `channels_v` dit quels canaux CE telephone a reellement crees. On le lit
    // avec un repli sur l'ancienne forme : si la colonne n'existe pas encore
    // (fonction deployee avant sa migration), on continue sans canal plutot que
    // de faire taire toutes les notifications du produit.
    const tokenCols = 'token, channels_v';
    let tokens: { token: string; channels_v?: number }[] | null = null;
    {
      let q = sb.from('push_tokens').select(tokenCols).in('user_id', userIds);
      if (input.app) q = q.eq('app', input.app);
      const { data, error } = await q;
      if (error) {
        console.error('[push] token fetch (with channels_v) failed:', error);
        let q2 = sb.from('push_tokens').select('token').in('user_id', userIds);
        if (input.app) q2 = q2.eq('app', input.app);
        const { data: d2, error: e2 } = await q2;
        if (e2) {
          console.error('[push] token fetch failed:', e2);
          return;
        }
        tokens = (d2 ?? []) as { token: string }[];
      } else {
        tokens = (data ?? []) as { token: string; channels_v?: number }[];
      }
    }
    if (!tokens?.length) return;

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json',
    };
    const accessToken = Deno.env.get('LINKY_EXPO_PUSH_TOKEN');
    if (accessToken) headers.authorization = `Bearer ${accessToken}`;

    const kind: NotifyKind = input.kind ?? KIND_FROM_CATEGORY[input.category] ?? 'info';

    // « high » reveille l'appareil malgre le Doze ; on ne le reserve pas aux
    // seules demandes a trancher, parce qu'un paiement refuse qui arrive une
    // heure plus tard ne sert a rien non plus.
    const priority = kind === 'message' || kind === 'info' ? 'default' : 'high';

    const messages = tokens.map((t) => {
      // ANDROID : le son appartient au CANAL, pas au push. Et nommer un canal
      // que l'appareil n'a pas cree fait disparaitre la notification en
      // silence — d'ou le `null` prudent pour les bundles anterieurs.
      const channelId = channelIdFor(kind, Number(t.channels_v ?? 0));
      return {
        to: t.token,
        title: input.title,
        body: input.body,
        // iOS : c'est CE champ qui porte le son. Android l'ignore.
        sound: iosSoundFor(kind),
        priority,
        ...(channelId ? { channelId } : {}),
        ...(input.decision ? { categoryId: DECISION_CATEGORY_ID } : {}),
        data: {
          deeplink: input.deeplink ?? null,
          category: input.category,
          kind,
          decision: input.decision === true,
          refType: input.refType ?? null,
          refId: input.refId ?? null,
        },
      };
    });

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
