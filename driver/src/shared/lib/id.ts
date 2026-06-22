/**
 * Generate a collision-resistant id for client-side entities.
 * Uses the platform UUID when available (Hermes / web), with a
 * dependency-free fallback.
 */
export function makeId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
