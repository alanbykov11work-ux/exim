-- Per-user visibility fingerprint (count + md5 of ids) for every legacy table; run before and after cutover and compare.
\set QUIET on
create temp table if not exists vis(uid uuid, role text, t text, n bigint, ids text);
truncate vis;
do $$
declare u record; t text; n bigint; ids text;
begin
 for u in select p.id, p.role from public.profiles p loop
  foreach t in array array['orders','order_history','chats','chat_members','chat_messages','tasks','task_comments','leads','lead_history','profiles'] loop
   perform set_config('request.jwt.claims', json_build_object('sub',u.id,'role','authenticated')::text, true);
   execute 'set local role authenticated';
   begin
     execute format('select count(*), md5(coalesce(string_agg(k, '','' order by k),'''')) from (select %s as k from public.%I x) q', case t when 'chat_members' then 'x.chat_id::text||''/''||x.user_id::text' else 'x.id::text' end, t) into n, ids;
   exception when others then n := -1; ids := sqlerrm;
   end;
   execute 'reset role';
   insert into vis values (u.id, u.role, t, n, ids);
  end loop;
 end loop;
end $$;
\copy (select uid, role, t, n, ids from vis order by 1,3) to pstdout csv
