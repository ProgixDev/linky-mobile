import { z } from 'zod';

/**
 * Notifications contracts — the in-app inbox backed by `list-notifications` +
 * `mark-notifications-read`. Validated at the network edge (lib/notifications-api.ts)
 * then mapped to the flat view model below; see docs/conventions/code-style.md.
 *
 * The same `notifications` table feeds BOTH Linky apps (it is app-agnostic), so a
 * driver only ever sees rows addressed to their user_id by the backend.
 */

// --- Wire shape: a single `list-notifications` row (snake_case, nullable fields) ---
const NotificationWireSchema = z.object({
  id: z.string(),
  category: z.string(),
  title: z.string(),
  body: z.string(),
  icon_hint: z.string().nullish(),
  deeplink: z.string().nullish(),
  ref_type: z.string().nullish(),
  ref_id: z.string().nullish(),
  read_at: z.string().nullish(),
  created_at: z.string(),
});

const CursorSchema = z.object({ created_at: z.string(), id: z.string() });
export type NotificationCursor = z.infer<typeof CursorSchema>;

export const NotificationListResponseSchema = z.object({
  notifications: z.array(NotificationWireSchema),
  next_cursor: CursorSchema.nullish(),
  unread_count: z.number().int().nonnegative().catch(0),
});

export const MarkReadResponseSchema = z.object({
  marked_count: z.number().int().nonnegative().catch(0),
});

// --- View model (inbox UI) ---
export type AppNotification = {
  id: string;
  category: string;
  title: string;
  body: string;
  iconHint: string;
  /** expo-router path to follow on tap (validated before use), or null. */
  deeplink: string | null;
  read: boolean;
  /** epoch ms, for stable sort + relative time. */
  createdAt: number;
};

export function mapNotification(w: z.infer<typeof NotificationWireSchema>): AppNotification {
  return {
    id: w.id,
    category: w.category,
    title: w.title,
    body: w.body,
    iconHint: w.icon_hint ?? 'info',
    deeplink: w.deeplink ?? null,
    read: w.read_at != null,
    createdAt: Date.parse(w.created_at) || 0,
  };
}
