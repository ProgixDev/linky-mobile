-- pgTAP RLS tests. Run with: supabase test db
-- These assert the security INVARIANTS, not behaviour — they fail loudly if a
-- future migration disables RLS or opens a client write path on entitlements.

begin;
select plan(4);

-- 1) RLS is enabled on EVERY table in the public schema (deny-by-default).
select ok(
  (select bool_and(rowsecurity) from pg_tables where schemaname = 'public'),
  'RLS is enabled on all public tables'
);

-- 2) notes exposes exactly the four owner-scoped policies (one per command).
select policies_are(
  'public', 'notes',
  array[
    'notes: select own',
    'notes: insert own',
    'notes: update own',
    'notes: delete own'
  ],
  'notes has exactly the owner-scoped CRUD policies'
);

-- 3) subscriptions has NO client write policy (only the webhook/service_role writes).
select is_empty(
  $$ select p.polname
       from pg_policy p join pg_class c on c.oid = p.polrelid
      where c.relname = 'subscriptions' and p.polcmd in ('a', 'w', 'd') $$,
  'subscriptions has no client INSERT/UPDATE/DELETE policy'
);

-- 4) anon has no table privileges (blanket grants were revoked).
select ok(
  not has_table_privilege('anon', 'public.notes', 'select'),
  'anon cannot select from notes'
);

select * from finish();
rollback;
