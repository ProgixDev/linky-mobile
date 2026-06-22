import { z } from 'zod';

export const BUCKET = 'user-media';

/** A stored object's path within the bucket, e.g. "<uid>/169..._photo.jpg". */
export const MediaPathSchema = z.string().min(3);
export type MediaPath = z.infer<typeof MediaPathSchema>;

/** Result of a successful upload. */
export const UploadedMediaSchema = z.object({
  path: MediaPathSchema,
  contentType: z.string(),
});
export type UploadedMedia = z.infer<typeof UploadedMediaSchema>;

/** Allowed image content types — keep the surface small and known. */
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;
