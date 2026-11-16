-- Production drift captured 2026-11-16 (read-only catalog of project Exim SuperApp): differences between the legacy repo SQL
-- (schema..admin_roles) and production. Used to build an exact production replica for rehearsal and in DB rollback.
alter table public.chat_messages add column if not exists file_name text, add column if not exists file_path text;
drop policy if exists "orders update client decision" on public.orders;
drop policy if exists "orders update staff" on public.orders;
create policy "orders update staff" on public.orders for update using (is_manager() or logist_id = auth.uid())
  with check ((is_manager() or logist_id = auth.uid()) and client_id = (select o.client_id from public.orders o where o.id = orders.id));
drop function if exists public.grant_admin(text);
CREATE OR REPLACE FUNCTION public.decide_order(p_order_id uuid, p_decision text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_decision not in ('approved','rejected') then
    raise exception 'invalid decision';
  end if;
  update public.orders
     set client_decision = p_decision,
         client_decision_at = now(),
         status = p_decision
   where id = p_order_id
     and client_id = auth.uid()
     and status = 'offer_sent';
  if not found then
    raise exception 'order not found or not in offer_sent state';
  end if;
  insert into public.order_history (order_id, actor_id, action, snapshot)
  values (p_order_id, auth.uid(), 'client_' || p_decision, '{}'::jsonb);
end; $function$
;
