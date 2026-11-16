-- DB rollback for TASK-2026-001 cutover: return public schema + storage to the pre-cutover state.
-- Followed by: legacy schema files, drift.sql, data reload (load.sql + seq.sql).
drop policy if exists request_files_insert on storage.objects;
drop policy if exists request_files_select on storage.objects;
drop policy if exists gate_documents_insert on storage.objects;
drop policy if exists gate_documents_select on storage.objects;
delete from storage.buckets b where b.id in (select id from storage.buckets where id not in ('documents')) and not exists (select 1 from storage.objects o where o.bucket_id=b.id);
drop schema public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
-- Then, in order: supabase/schema.sql workflow.sql chats_tasks.sql badges.sql crm.sql smart_ref.sql rate_limit.sql admin_roles.sql,
-- docs/.../prod-drift-2026-11-16.sql, reload of the public data from the pre-cutover backup (kept off Git), sequence reset, and:
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='chat_members') then
    alter publication supabase_realtime add table public.chat_members; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='chat_messages') then
    alter publication supabase_realtime add table public.chat_messages; end if;
end $$;
