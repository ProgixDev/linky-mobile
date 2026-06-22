import { z } from 'zod';

export const FlagSchema = z.object({
  key: z.string(),
  enabled: z.boolean(),
  rollout: z.number().int().min(0).max(100),
});
export type Flag = z.infer<typeof FlagSchema>;

/**
 * Deterministic 0..99 bucket from a stable string (uid + key). Same input always
 * yields the same bucket, so a user doesn't flicker in/out of a rollout. Simple
 * FNV-1a hash — not cryptographic, just stable and well-distributed.
 */
export function bucketFor(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return Math.abs(hash) % 100;
}

/** Is the flag on for this user, accounting for rollout percentage? */
export function isFlagOn(flag: Flag, userId: string | null): boolean {
  if (!flag.enabled) return false;
  if (flag.rollout >= 100) return true;
  if (flag.rollout <= 0) return false;
  return bucketFor(`${userId ?? 'anon'}:${flag.key}`) < flag.rollout;
}
