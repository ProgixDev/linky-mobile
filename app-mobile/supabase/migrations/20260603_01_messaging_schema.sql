-- conversations: 1 conv par (paire d'utilisateurs, contexte pinné)
-- Le pinné identifie de quoi on parle (un produit, une propriété, ou rien = libre).
-- participant_a_id et participant_b_id sont stockés triés lexicographiquement
-- pour permettre l'unique constraint en O(1).
create table public.conversations (
  id uuid primary key default public.uuidv7(),
  participant_a_id uuid not null references public.users(id),
  participant_b_id uuid not null references public.users(id),
  pinned_kind text check (pinned_kind in ('product', 'property')),
  pinned_id uuid,
  last_message_text text,
  last_message_at timestamptz,
  last_message_sender_id uuid references public.users(id),
  unread_a integer not null default 0,
  unread_b integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participants_sorted check (participant_a_id < participant_b_id),
  constraint participants_distinct check (participant_a_id <> participant_b_id),
  constraint pinned_complete check (
    (pinned_kind is null and pinned_id is null) or
    (pinned_kind is not null and pinned_id is not null)
  )
);

-- unique : 1 conv par (paire, contexte pinné). NULL pinned_id permet 1 conv libre par paire.
create unique index conversations_unique_paired_context_idx
  on public.conversations (participant_a_id, participant_b_id, coalesce(pinned_kind, ''), coalesce(pinned_id::text, ''));

-- lookup côté liste : "mes conversations triées par dernière activité"
create index conversations_participant_a_idx on public.conversations (participant_a_id, last_message_at desc);
create index conversations_participant_b_idx on public.conversations (participant_b_id, last_message_at desc);

create table public.messages (
  id uuid primary key default public.uuidv7(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.users(id),
  body text not null check (length(body) > 0 and length(body) <= 2000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- lookup côté détail : "messages d'une conversation, du plus récent au plus ancien"
create index messages_conversation_created_idx on public.messages (conversation_id, created_at desc);

-- RLS : zero policy = deny default pour anon + authenticated (service_role bypass)
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
