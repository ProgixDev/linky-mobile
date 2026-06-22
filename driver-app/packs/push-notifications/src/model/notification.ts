import { z } from 'zod';

/** A device push token row, as stored server-side. */
export const DeviceTokenSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  token: z.string().min(1),
  platform: z.enum(['ios', 'android']),
});
export type DeviceToken = z.infer<typeof DeviceTokenSchema>;

/**
 * The data payload you attach to a push, validated when a tap is handled.
 * Keep it small and non-sensitive — push payloads are not a secure channel.
 */
export const PushDataSchema = z
  .object({
    /** Deep-link path to open on tap, e.g. "/chat/123". Validated by the deep-link gate. */
    route: z.string().startsWith('/').optional(),
  })
  .passthrough();
export type PushData = z.infer<typeof PushDataSchema>;
