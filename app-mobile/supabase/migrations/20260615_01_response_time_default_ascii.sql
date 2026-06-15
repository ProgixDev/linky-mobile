-- Phase Y.1: shops.response_time_text — drop the cosmetic em-dash default
-- and blank any mojibake/placeholder values.
--
-- Background: the prior default was the literal string em-dash space em-dash.
-- That UTF-8 byte sequence got CP1252-mangled at migration apply time, so
-- every shop row's response_time_text is now stored as the 17-byte sequence
-- c3a2 e282ac e2809d 20 c3a2 e282ac e2809d (visible as the four-character
-- mojibake "a-with-circumflex, euro, right-double-quote, space, repeat"). The
-- frontend renders the field raw, so the shop screen shows garbage.
--
-- Fix:
--   1. New default is the empty string. The UI now hides the row when the
--      value is empty/whitespace (Phase Y.1 UI patch), so blank is the honest
--      fallback. Inventing a fake response time would be misleading.
--   2. Blank every row whose value is not pure printable ASCII. Today no shop
--      has a meaningful response time (the column has always carried the
--      placeholder), so this is safe. Future writes can store full UTF-8.
--
-- This migration is intentionally ASCII-only to avoid the encoding bug
-- recurring on apply.

alter table public.shops
  alter column response_time_text set default '';

update public.shops
   set response_time_text = ''
 where response_time_text !~ '^[\x20-\x7E]*$';
