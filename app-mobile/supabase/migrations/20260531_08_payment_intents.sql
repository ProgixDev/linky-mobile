-- Phase I.1 — payment_intents (per-attempt granularity) + mock_lengopay_state.
-- Lock decisions from Q4/Q6:
--   * rail-agnostic schema (rail, rail_intent_id) — V1 = 'lengopay', Phase I' = direct rails
--   * per-attempt granularity (Lengopay returns fresh rail_intent_id per init call)
--   * unique (rail, rail_intent_id) — refs aren't globally unique across rails
--   * unique (order_id, attempt_index) — race guard against double-insert
--   * payer_phone nullable — populated for MoMo (Q6), NULL for cards
--   * partial index on (created_at) WHERE status='pending' — cron worker hot path
--   * RLS enabled, no policies — service_role bypasses (matches H2 pattern)
--   * No updated_at trigger — edge functions set updated_at = now() manually
--     in each UPDATE (matches orders/wallets convention, not users' trigger pattern)

create table public.payment_intents (
  id                  uuid primary key default uuidv7(),
  order_id            uuid not null references public.orders(id),

  -- Rail layer
  rail                text not null default 'lengopay'
                      check (rail in ('lengopay','stripe','orange_direct','mtn_direct')),
  rail_intent_id      text not null,
  rail_status         text,                          -- raw rail-side status string

  -- Linky layer
  status              text not null default 'pending'
                      check (status in ('pending','completed','failed','expired','cancelled')),
  method              text not null
                      check (method in ('orange-money','mtn-money','card')),
  currency            text not null default 'GNF'
                      check (currency in ('GNF','EUR')),
  amount_minor        bigint not null check (amount_minor > 0),

  -- Payer side (Q6 resolution of deferred Pushback 3)
  payer_phone         text,                          -- populated for MoMo (pre-fill or override), NULL for cards

  -- Polling worker state
  attempt_index       smallint not null default 1,   -- n-th payment attempt for this order (user-facing)
  attempts_count      smallint not null default 0,   -- cron poll counter (debug telemetry)
  last_polled_at      timestamptz,
  last_error_code     text,
  last_error_message  text,

  -- Lifecycle
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  completed_at        timestamptz,

  -- Uniqueness invariants
  unique (rail, rail_intent_id),
  unique (order_id, attempt_index)
);

-- Cron worker hot path: pick pending intents oldest-first, lock them.
create index payment_intents_pending_by_age
  on public.payment_intents (created_at)
  where status = 'pending';

-- Admin/support lookup: every intent for an order, newest first.
create index payment_intents_by_order
  on public.payment_intents (order_id, created_at desc);

-- RLS: enable; no policies → service_role bypasses (matches H2 tables).
-- Edge functions access control happens at the edge layer via requireUser +
-- subsequent buyer_id matching in queries.
alter table public.payment_intents enable row level security;

-- Mock state for the mock-lengopay edge function (Q8 sandbox-mocking layer).
-- Persists across cron ticks so the mock can return consistent status for the
-- same intent_id. Dev-only — reset with: DELETE FROM public.mock_lengopay_state;
create table public.mock_lengopay_state (
  intent_id       text primary key,
  created_at      timestamptz not null default now(),
  magic_phone     text,                              -- the phone that triggered init
  forced_outcome  text                               -- null = auto-success after 10s
                                                     -- values: 'fail_insufficient' | 'fail_wrong_number' | 'cancel'
);

alter table public.mock_lengopay_state enable row level security;
