-- Phase V.1 — idempotency reserve-first.
--
-- Pre-V1 : checkIdempotency SELECTed before the handler ran ; storeIdempotency
-- UPSERTed after. Two concurrent same-key POSTs therefore both reached the
-- handler (duplicate place-order, duplicate pushes, duplicate ledger writes).
-- The path also swallowed DB errors silently, degrading replay into
-- re-execution — exactly the wrong failure mode on money endpoints.
--
-- Reserve-first design : INSERT the key with status='in_flight' BEFORE the
-- handler. Concurrent INSERT raises unique_violation (23505) → caller reads
-- the existing row, replays if 'completed', returns 409 REQUEST_IN_FLIGHT if
-- still 'in_flight'. Handler success UPDATEs to 'completed' + persists the
-- response body. Handler throw DELETEs the reservation so a client retry can
-- re-execute. The TTL field doubles as the in-flight watchdog : insert with
-- expires_at = now() + 5 minutes (a handler exceeding that is a hung
-- request) and bump to now() + 24 hours on completion. The existing nightly
-- cleanup cron (20260528_04) reaps both classes via `expires_at < now()`.
--
-- Schema deltas :
--   - new column status text default 'completed', CHECK in
--     ('in_flight','completed','failed'). Default 'completed' keeps every
--     EXISTING row replayable (the new code reads status to decide replay
--     vs 409 ; pre-V1 rows must look "done" so they keep replaying).
--   - status_code + response_body + expires_at made NULLABLE — an in_flight
--     row has no body/code yet. expires_at IS still set at insert (the
--     in-flight watchdog), so the cleanup cron query keeps working
--     unchanged.

alter table public.idempotency_keys
  add column if not exists status text not null default 'completed';

alter table public.idempotency_keys
  drop constraint if exists idempotency_keys_status_check;
alter table public.idempotency_keys
  add constraint idempotency_keys_status_check
  check (status in ('in_flight','completed','failed'));

alter table public.idempotency_keys
  alter column status_code drop not null,
  alter column response_body drop not null;

-- Helper index on status for the cleanup cron's pending watchdog query
-- (rare ; total table volume is small per TTL_MS=24h, but the predicate
-- is selective so the index is cheap).
create index if not exists idempotency_keys_in_flight_idx
  on public.idempotency_keys (created_at)
  where status = 'in_flight';
