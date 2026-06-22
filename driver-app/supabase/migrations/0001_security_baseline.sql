-- 0001_security_baseline — deny-by-default posture for the Data API.
--
-- The mobile client ships a PUBLIC anon key, so Row-Level Security (not key
-- secrecy) is the only real boundary. The #1 real-world Supabase breach is a
-- table that is reachable by `anon`/`authenticated` but has RLS disabled (e.g.
-- CVE-2025-48757). This migration makes that mistake structurally hard:
--   1. revoke the historic blanket grants (access becomes opt-in per table),
--   2. add a private schema for security-definer helpers (never API-exposed),
--   3. auto-enable RLS on every new public table via an event trigger.
-- See docs/research/03-supabase-security.md and docs/architecture/backend.md.

-- 1) Remove default/blanket privileges from the API roles. Tables then expose
--    nothing until you explicitly GRANT + add a policy.
alter default privileges in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;
revoke select, insert, update, delete on all tables in schema public
  from anon, authenticated;

-- 2) Private schema for SECURITY DEFINER helpers. Not in the exposed schema set,
--    so PostgREST never serves it.
create schema if not exists private;
revoke all on schema private from anon, authenticated;

-- 3) Belt-and-suspenders: enable RLS on every newly created public table.
--    (Dashboard-created tables get RLS automatically; raw-SQL ones do NOT — this
--    closes that gap so a forgotten `enable row level security` can't leak data.)
create or replace function private.enable_rls_on_new_tables()
  returns event_trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  obj record;
begin
  for obj in
    select * from pg_event_trigger_ddl_commands()
    where command_tag = 'CREATE TABLE' and schema_name = 'public'
  loop
    execute format('alter table %s enable row level security;', obj.object_identity);
  end loop;
end;
$$;

drop event trigger if exists trg_enable_rls_on_new_tables;
create event trigger trg_enable_rls_on_new_tables
  on ddl_command_end
  when tag in ('CREATE TABLE')
  execute function private.enable_rls_on_new_tables();
