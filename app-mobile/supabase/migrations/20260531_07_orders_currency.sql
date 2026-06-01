-- Phase I.1 — Add currency column to orders.
-- Forward-compat for Stripe (EUR) in Phase I'. V1 (Lengopay) is GNF-only,
-- so the column defaults to 'GNF' and all existing rows backfill cleanly.
-- The hardcoded 'GNF' literals in place_order / confirm_order_receipt /
-- dispute_order RPCs stay as-is per Q3 sub-decision; they get parameterized
-- when Stripe (Phase I') actually introduces EUR pricing.
alter table public.orders
  add column currency text not null default 'GNF'
  check (currency in ('GNF','EUR'));
