import { appStorage } from '@/shared/lib/storage';
import { logger } from '@/shared/lib/logger';

const STORAGE_KEY = 'offline.mutation-queue';
const MAX_ATTEMPTS = 5;

export type QueuedMutation = {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
  createdAt: number;
};

// Registered executors: type -> how to actually perform the write online.
const executors = new Map<string, (payload: unknown) => Promise<void>>();
let queue: QueuedMutation[] = [];
let loaded = false;
const listeners = new Set<(count: number) => void>();

/** Register how a mutation type is replayed. Call once at startup per type. */
export function registerMutation<T>(type: string, run: (payload: T) => Promise<void>): void {
  executors.set(type, run as (payload: unknown) => Promise<void>);
}

async function persist(): Promise<void> {
  await appStorage.set(STORAGE_KEY, JSON.stringify(queue));
  listeners.forEach((l) => l(queue.length));
}

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  const raw = await appStorage.get(STORAGE_KEY);
  queue = raw ? (JSON.parse(raw) as QueuedMutation[]) : [];
  loaded = true;
}

/**
 * Enqueue a write to run now if possible, or later when back online. Returns the
 * queued item id. The UI should already have applied the change optimistically.
 */
export async function enqueueMutation(type: string, payload: unknown): Promise<string> {
  await ensureLoaded();
  const item: QueuedMutation = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    type,
    payload,
    attempts: 0,
    createdAt: Date.now(),
  };
  queue.push(item);
  await persist();
  return item.id;
}

/**
 * Replay everything in order. Successful items are removed; failures are kept and
 * retried next drain, up to MAX_ATTEMPTS (then dropped to avoid a poison item
 * blocking the queue forever). Safe to call repeatedly.
 */
export async function drainQueue(): Promise<void> {
  await ensureLoaded();
  if (queue.length === 0) return;

  const remaining: QueuedMutation[] = [];
  for (const item of queue) {
    const run = executors.get(item.type);
    if (!run) {
      // No executor registered yet — keep it for a later drain.
      remaining.push(item);
      continue;
    }
    try {
      await run(item.payload);
    } catch (err) {
      logger.warn('offline: mutation replay failed', { type: item.type, err });
      if (item.attempts + 1 < MAX_ATTEMPTS) {
        remaining.push({ ...item, attempts: item.attempts + 1 });
      } else {
        logger.error('offline: dropping mutation after max attempts', { type: item.type });
      }
    }
  }
  queue = remaining;
  await persist();
}

export async function pendingCount(): Promise<number> {
  await ensureLoaded();
  return queue.length;
}

export function subscribePending(listener: (count: number) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
