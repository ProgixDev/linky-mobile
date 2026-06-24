/**
 * Delivery deadline helpers.
 *
 * The backend does not yet return a real `deadlineAt` (exec-plan backend ask #2),
 * so we DERIVE a fallback: the delivery's createdAt (≈ when it entered the
 * courier's worklist) + an SLA window. When the backend ships `deadlineAt`/SLA,
 * swap `getDeadline` to read it and everything downstream (countdown, "Urgent" /
 * "Aujourd'hui" filters) follows.
 */

export const SLA_HOURS = 24;
const SLA_MS = SLA_HOURS * 60 * 60 * 1000;

const URGENT_MS = 60 * 60 * 1000; // "Urgent" = ≤ 1h left (or overdue)
const SOON_MS = 2 * 60 * 60 * 1000; // amber threshold

export type Urgency = 'normal' | 'soon' | 'urgent' | 'overdue';

/** Derived delivery deadline (epoch ms). Fallback until backend `deadlineAt` ships. */
export function getDeadline(d: { createdAt: number }): number {
  return d.createdAt + SLA_MS;
}

export function remainingMs(deadline: number, now: number): number {
  return deadline - now;
}

/** Urgency band for the countdown color (amber → red as it nears/passes zero). */
export function urgency(remaining: number): Urgency {
  if (remaining <= 0) return 'overdue';
  if (remaining <= URGENT_MS) return 'urgent';
  if (remaining <= SOON_MS) return 'soon';
  return 'normal';
}

/** Compact remaining-time label, e.g. "1h 42m" or "27m". */
export function formatRemaining(remaining: number): string {
  if (remaining <= 0) return 'En retard';
  const totalMin = Math.floor(remaining / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h >= 1 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`;
}

/** "Urgent" filter predicate: ≤ 1h left or already overdue. */
export function isUrgent(deadline: number, now: number): boolean {
  return remainingMs(deadline, now) <= URGENT_MS;
}

/** True when two epoch-ms timestamps fall on the same calendar day. */
export function isSameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}
