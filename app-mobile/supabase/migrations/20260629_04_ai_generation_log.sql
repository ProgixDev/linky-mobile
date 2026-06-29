-- Rate-limit log for the AI description generator (each row = one paid Anthropic call).
-- generate-description counts a user's recent rows to cap usage (8/min, 60/day) so a
-- compromised or abusive account can't run up the Anthropic bill.
create table if not exists public.ai_generation_log (
  id         uuid primary key default public.uuidv7(),
  user_id    uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists ai_gen_user_created_idx on public.ai_generation_log (user_id, created_at desc);

alter table public.ai_generation_log enable row level security;
