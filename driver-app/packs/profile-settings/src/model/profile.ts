import { z } from 'zod';

export const ProfileSchema = z.object({
  id: z.string(),
  display_name: z.string().nullable(),
  avatar_url: z.string().url().nullable(),
  bio: z.string().nullable(),
  created_at: z.string(),
});
export type Profile = z.infer<typeof ProfileSchema>;

/** Editable fields, validated before a write. */
export const ProfileUpdateSchema = z.object({
  display_name: z.string().trim().min(1, 'Name is required').max(80).optional(),
  avatar_url: z.string().url().optional(),
  bio: z.string().max(280, 'Keep your bio under 280 characters').optional(),
});
export type ProfileUpdate = z.infer<typeof ProfileUpdateSchema>;
