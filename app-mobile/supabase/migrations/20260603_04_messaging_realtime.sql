-- Phase M.1 — Authorization for Supabase Realtime CDC on messaging tables.
--
-- These SELECT policies gate ONLY what authenticated users receive via the
-- realtime change stream. Edge functions use service_role and bypass RLS as
-- before. auth.uid() reads from the JWT 'sub' claim — the JWT must be signed
-- with the project's legacy HS256 secret, exposed to the edge fn as
-- LINKY_SB_JWT_SECRET (minted via mint-realtime-jwt M.2 ; renamed X.11
-- because Supabase reserves the SUPABASE_ prefix for user-defined secrets).
--
-- The `(select auth.uid())` wrapper is the recommended pattern : it lets
-- Postgres cache the function result across rows in a single query.

create policy "conversations_realtime_select_participant"
  on public.conversations
  for select
  to authenticated
  using (
    (select auth.uid()) = participant_a_id
    or (select auth.uid()) = participant_b_id
  );

create policy "messages_realtime_select_participant"
  on public.messages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and ((select auth.uid()) = c.participant_a_id
             or (select auth.uid()) = c.participant_b_id)
    )
  );

-- Add tables to the default Supabase Realtime publication. supabase_realtime
-- is a built-in publication created by the Supabase platform — we just attach
-- our tables to it.
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.messages;
