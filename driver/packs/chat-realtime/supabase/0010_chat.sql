-- chat-realtime — DMs + group chat over Supabase Realtime. RLS-first.
-- RLS is auto-enabled on these tables by the skeleton's 0001 event trigger.
-- Membership is checked via a SECURITY DEFINER helper to avoid recursive RLS
-- (a policy on conversation_members that queries conversation_members would loop).

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  is_group boolean not null default false,
  title text check (char_length(title) <= 120),
  created_at timestamptz not null default now()
);
grant select, insert on public.conversations to authenticated;

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
grant select, insert, update on public.conversation_members to authenticated;
create index conversation_members_user_idx on public.conversation_members (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
grant select, insert on public.messages to authenticated;
create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- Membership helper (bypasses RLS; pinned search_path).
create or replace function private.is_conversation_member(conv uuid, uid uuid)
  returns boolean
  language sql
  security definer
  set search_path = ''
  stable
as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = conv and m.user_id = uid
  );
$$;

-- conversations: members read; creator inserts.
create policy "conversations: member read" on public.conversations for select to authenticated
  using (private.is_conversation_member(id, (select auth.uid())));
create policy "conversations: create own" on public.conversations for insert to authenticated
  with check ((select auth.uid()) = created_by);

-- members: read members of conversations you're in; add yourself, or the creator adds others;
-- update only your own read state.
create policy "members: read in my convs" on public.conversation_members for select to authenticated
  using (private.is_conversation_member(conversation_id, (select auth.uid())));
create policy "members: insert" on public.conversation_members for insert to authenticated
  with check (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.created_by = (select auth.uid())
    )
  );
create policy "members: update own read state" on public.conversation_members for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- messages: members read; members send only as themselves.
create policy "messages: member read" on public.messages for select to authenticated
  using (private.is_conversation_member(conversation_id, (select auth.uid())));
create policy "messages: member send" on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and private.is_conversation_member(conversation_id, (select auth.uid()))
  );

-- Stream new messages over Realtime (RLS still applies to what each client receives).
alter publication supabase_realtime add table public.messages;
