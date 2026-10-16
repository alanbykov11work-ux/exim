-- TASK-2026-001 / Foundation Gate / Wave 2 — reliable shell
-- Search by number (REQ-005, AC-TASK-008).
--
-- Requires: foundation_wave_1b_legacy_scope.sql.
--
-- security invoker: the caller's own row policies decide what is found, so
-- an unknown number and a number from another scope give the same empty
-- answer and the response never reveals that an object exists.

begin;

create or replace function public.find_by_number(p_number text)
returns table (kind text, id uuid, ref text)
language sql
security invoker
set search_path = ''
stable
as $function$
  with q as (
    select upper(btrim(coalesce(p_number, ''))) as value
  )
  select 'order'::text, o.id, o.ref
  from public.orders o, q
  where char_length(q.value) between 3 and 40
    and upper(o.ref) = q.value
  union all
  select 'transport'::text, t.id, t.ref
  from public.transports t, q
  where char_length(q.value) between 3 and 40
    and upper(t.ref) = q.value
  limit 5
$function$;

revoke all on function public.find_by_number(text) from public, anon;
grant execute on function public.find_by_number(text) to authenticated;

commit;
