// Phase V.1 — reserve-first idempotency.
//
// Old design (pre-V1) :
//   1) SELECT idempotency_keys by key, return cached row if any.
//   2) Run handler.
//   3) UPSERT idempotency_keys with the response.
// Two concurrent same-key POSTs both reached step 2 (no row visible) and the
// handler ran twice. DB errors during step 1 were swallowed, treating "error
// reading cache" as "no cache" and re-executing the handler — the wrong
// failure mode on money endpoints.
//
// New design — reserve-first :
//   1) INSERT { key, fingerprint, status='in_flight', expires_at=now+5min }.
//   2) On unique_violation (23505), SELECT the existing row :
//      - status='completed' AND fingerprint matches AND not expired → REPLAY
//        (caller returns the cached body unchanged).
//      - status='completed' AND fingerprint mismatch → CONFLICT (409).
//      - status='in_flight' AND fresh (< watchdog TTL) → IN_FLIGHT (409
//        REQUEST_IN_FLIGHT, calm French message).
//      - status='in_flight' AND stale (> watchdog TTL, handler died /
//        function rotated) → DELETE the row + retry the INSERT.
//      - status='failed' → DELETE + retry the INSERT (handler had thrown,
//        client is allowed to retry).
//   3) On INSERT success, run the handler. On success, UPDATE the row to
//      status='completed' with body/code/expires_at = now+24h. On throw,
//      DELETE the row so the next retry executes.
//   4) DB-layer errors during step 1 or 2 PROPAGATE to the caller — the
//      wrapper turns them into INTERNAL_ERROR 500. Never silently re-execute.
//
// The cache TTL for completed rows is still 24 hours, kept by setting
// expires_at on the completion UPDATE ; the nightly cleanup_cron
// (20260528_04) reaps both stale in_flight rows and expired completed rows
// with one `where expires_at < now()` predicate.
import type { SupabaseClient } from '@shared/db.ts';

// PostgrestError isn't re-exported by db.ts ; pull just the shape we need.
interface PgError { code?: string; message?: string; details?: string; hint?: string }

const enc = new TextEncoder();

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Completed-row TTL : how long a replay is honored after completion.
const COMPLETED_TTL_MS = 24 * 60 * 60 * 1000;
// In-flight watchdog : a handler exceeding this is treated as dead and the
// reservation is reaped to unblock retries. 5 minutes covers Stripe-sheet
// confirmation + place-order ; nothing in V1 runs longer.
const IN_FLIGHT_TTL_MS = 5 * 60 * 1000;

export interface ReserveResult {
  fingerprint: string;
  // 'execute' : caller runs the handler. 'replay' : caller returns the
  // cached body directly. 'conflict' : 409 IDEMPOTENCY_KEY_CONFLICT.
  // 'in_flight' : 409 REQUEST_IN_FLIGHT.
  action: 'execute' | 'replay' | 'conflict' | 'in_flight';
  // Populated only when action='replay'.
  cached?: { status_code: number; response_body: unknown };
}

class IdempotencyDbError extends Error {
  constructor(message: string, public cause?: PgError | null) {
    super(message);
    this.name = 'IdempotencyDbError';
  }
}
export function isIdempotencyDbError(e: unknown): e is IdempotencyDbError {
  return e instanceof IdempotencyDbError;
}

interface IdemRow {
  key: string;
  fingerprint: string;
  status: 'in_flight' | 'completed' | 'failed';
  status_code: number | null;
  response_body: unknown;
  created_at: string;
  expires_at: string | null;
}

async function tryInsertReservation(
  sb: SupabaseClient,
  key: string,
  fingerprint: string,
): Promise<{ inserted: true } | { inserted: false; conflict: PgError }> {
  const expires_at = new Date(Date.now() + IN_FLIGHT_TTL_MS).toISOString();
  const { error } = await sb.from('idempotency_keys').insert({
    key,
    fingerprint,
    status: 'in_flight',
    expires_at,
  });
  if (!error) return { inserted: true };
  if (error.code === '23505') return { inserted: false, conflict: error };
  throw new IdempotencyDbError(`idempotency reserve insert: ${error.code}`, error);
}

async function readExisting(sb: SupabaseClient, key: string): Promise<IdemRow | null> {
  const { data, error } = await sb
    .from('idempotency_keys')
    .select('key, fingerprint, status, status_code, response_body, created_at, expires_at')
    .eq('key', key)
    .maybeSingle();
  if (error) {
    throw new IdempotencyDbError(`idempotency read: ${error.code}`, error);
  }
  return (data as IdemRow | null) ?? null;
}

// Optimistic-concurrency reap. created_at is the ownership token : it's
// stamped fresh on every insert (DB default now()) and we only delete the
// row we ACTUALLY observed in this loop iteration. Returns true iff we
// removed that exact row ; false means someone else reaped + reinserted
// between our read and our delete, so we must NOT assume we own anything
// — the caller re-loops and re-reads.
//
// Why it matters : without the created_at predicate, two requests racing on
// the same key could both read a stale (watchdog-expired in_flight, expired
// completed, or failed) row, both run an unconditional delete, both
// re-insert, both run the handler — the exact double-execution the
// reserve-first design exists to close.
async function reapRowIfMatches(
  sb: SupabaseClient,
  key: string,
  observedCreatedAt: string,
): Promise<boolean> {
  const { data, error } = await sb
    .from('idempotency_keys')
    .delete()
    .eq('key', key)
    .eq('created_at', observedCreatedAt)
    .select('key');
  if (error) throw new IdempotencyDbError(`idempotency reap: ${error.code}`, error);
  return Array.isArray(data) && data.length > 0;
}


export async function reserveIdempotency(
  sb: SupabaseClient,
  key: string,
  route: string,
  rawBody: string,
): Promise<ReserveResult> {
  const fingerprint = await sha256Hex(`${route}\n${rawBody}`);

  // Two attempts max : the second only fires if the first conflict hit a
  // stale/failed row that we reap below. Bounding the loop keeps a hostile
  // hammering pattern from producing an infinite retry chain.
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await tryInsertReservation(sb, key, fingerprint);
    if (result.inserted) {
      return { fingerprint, action: 'execute' };
    }

    const existing = await readExisting(sb, key);
    if (!existing) {
      // Lost a race with the cleanup cron between the conflict and the read.
      // Retry the insert.
      continue;
    }

    const now = Date.now();
    const expired = existing.expires_at !== null && new Date(existing.expires_at).getTime() <= now;

    if (existing.status === 'completed') {
      if (expired) {
        // Stale cache window ; reap-if-still-ours and re-loop. If someone
        // else reaped + reinserted between our read and our delete the
        // ownership predicate fails, we re-read, and we settle on whatever
        // their row holds.
        await reapRowIfMatches(sb, key, existing.created_at);
        continue;
      }
      if (existing.fingerprint !== fingerprint) {
        return { fingerprint, action: 'conflict' };
      }
      if (existing.status_code === null) {
        // Defensive : shouldn't happen for status='completed'. Treat as
        // corrupted cache → reap-if-ours + retry.
        await reapRowIfMatches(sb, key, existing.created_at);
        continue;
      }
      return {
        fingerprint,
        action: 'replay',
        cached: { status_code: existing.status_code, response_body: existing.response_body },
      };
    }

    if (existing.status === 'in_flight') {
      const watchdogExpired =
        new Date(existing.created_at).getTime() + IN_FLIGHT_TTL_MS <= now ||
        (existing.expires_at !== null && new Date(existing.expires_at).getTime() <= now);
      if (watchdogExpired) {
        // Reap the dead reservation — but only if it's still the exact row
        // we observed. A concurrent reaper may have already replaced it.
        await reapRowIfMatches(sb, key, existing.created_at);
        continue;
      }
      return { fingerprint, action: 'in_flight' };
    }

    // status='failed' (handler had thrown but cleanup hadn't run yet) →
    // reap-if-ours + retry. Client retries are allowed on the failure path.
    await reapRowIfMatches(sb, key, existing.created_at);
  }

  // Two attempts consumed without resolving — treat as in_flight to keep
  // the client retry pattern simple.
  return { fingerprint, action: 'in_flight' };
}

export async function completeIdempotency(
  sb: SupabaseClient,
  key: string,
  status_code: number,
  response_body: unknown,
): Promise<void> {
  const expires_at = new Date(Date.now() + COMPLETED_TTL_MS).toISOString();
  const { error } = await sb
    .from('idempotency_keys')
    .update({ status: 'completed', status_code, response_body, expires_at })
    .eq('key', key);
  if (error) {
    // Logged but NOT propagated — the handler has already run successfully
    // and the caller wants to return that body. Failing here would force
    // the user to retry a completed operation.
    //
    // Residual : the row stays status='in_flight' with the original 5-min
    // watchdog expiry. Same-key requests therefore return 409
    // REQUEST_IN_FLIGHT for up to 5 minutes, then the watchdog-expired
    // path reaps the row and the next retry re-executes the handler. That
    // re-execution IS a duplicate ; the trade is "duplicate-after-5-min on
    // a DB hiccup" vs "force-retry-a-successful-operation immediately".
    // For V1 we accept the former — making the tradeoff visible here so
    // future hardening (e.g. background retry of the UPDATE) is targeted.
    console.error('[idempotency] complete update error (response sent anyway):', error);
  }
}

export async function cancelIdempotency(sb: SupabaseClient, key: string): Promise<void> {
  const { error } = await sb.from('idempotency_keys').delete().eq('key', key);
  if (error) {
    // Same posture as completeIdempotency : log + swallow. The handler
    // already failed ; we don't want to mask that failure with a 500 from
    // the cleanup path.
    console.error('[idempotency] cancel delete error (original error sent anyway):', error);
  }
}
