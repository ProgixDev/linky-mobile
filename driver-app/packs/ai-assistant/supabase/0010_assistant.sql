-- ai-assistant — LLM chat history. RLS-first, owner-scoped.
-- RLS is auto-enabled on these tables by the skeleton's 0001 event trigger.
-- The model API key is NOT here and NOT in the app — it lives as a Supabase
-- secret read only by the ai-chat Edge Function (server side).

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text check (char_length(title) <= 200),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.ai_conversations to authenticated;
create index ai_conversations_user_idx on public.ai_conversations (user_id, created_at desc);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null check (char_length(content) between 1 and 32000),
  created_at timestamptz not null default now()
);
grant select, insert on public.ai_messages to authenticated;
create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);

-- Owner-scoped policies. (select auth.uid()) is wrapped so the planner caches it.
create policy "ai_conversations: own" on public.ai_conversations
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "ai_messages: read own" on public.ai_messages
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "ai_messages: insert own" on public.ai_messages
  for insert to authenticated
  with check (user_id = (select auth.uid()));
