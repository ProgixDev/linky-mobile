import { z } from 'zod';

export const NotificationSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  actor_id: z.string().uuid().nullable(),
  type: z.string(),
  body: z.string(),
  entity: z.string().nullable(),
  read_at: z.string().nullable(),
  created_at: z.string(),
});
export type Notification = z.infer<typeof NotificationSchema>;
