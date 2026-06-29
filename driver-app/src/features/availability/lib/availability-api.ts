import { apiPost } from '@/shared/lib/api';

import { AvailabilityWireSchema } from '../model/schema';

export type AvailabilityResult = { ok: true; online: boolean } | { ok: false };

/**
 * Read the courier's current online state. Reuses the authed
 * `livreur-application-status` endpoint, which returns `is_online` for approved
 * livreurs. Validated at this trust boundary; any failure → not-ok (the store keeps
 * its prior value).
 */
export async function fetchAvailability(): Promise<AvailabilityResult> {
  try {
    const data = await apiPost<unknown>({ path: '/livreur-application-status' });
    const parsed = AvailabilityWireSchema.safeParse(data);
    if (!parsed.success) return { ok: false };
    return { ok: true, online: parsed.data.is_online ?? false };
  } catch {
    return { ok: false };
  }
}

/**
 * Set the courier's online state (users.is_online) via `set-livreur-availability`.
 * Returns true on success; the store reverts its optimistic flip on false.
 */
export async function setAvailability(online: boolean): Promise<boolean> {
  try {
    await apiPost<unknown>({ path: '/set-livreur-availability', body: { online } });
    return true;
  } catch {
    return false;
  }
}
