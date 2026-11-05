-- TASK-2026-001 Wave 3a: RateQuote as an entity and the "at least two rates" rule.
-- Depends on: workflow.sql, foundation_wave_1.sql, foundation_wave_1b_legacy_scope.sql.
-- Rates are internal: clients never see them. Nothing is deleted; a rate is withdrawn.

create table if not exists public.rate_quotes (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete restrict,
  workspace_id uuid not null references public.tenant_workspaces (id),
  carrier      text not null check (length(btrim(carrier)) between 1 and 200),
  amount       numeric(14,2) not null check (amount > 0),
  currency     text not null default 'KZT' check (currency ~ '^[A-Z]{3}$'),
  valid_until  date,
  comment      text check (comment is null or length(comment) <= 2000),
  status       text not null default 'active' check (status in ('active', 'withdrawn')),
  created_by   uuid not null default auth.uid() references auth.users (id),
  created_at   timestamptz not null default now(),
  withdrawn_at timestamptz
);
create index if not exists rate_quotes_order_idx on public.rate_quotes (order_id);

alter table public.rate_quotes enable row level security;

create or replace function public.rate_quotes_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ws uuid;
  v_status text;
begin
  if tg_op = 'INSERT' then
    select o.workspace_id, o.status into v_ws, v_status from public.orders o where o.id = new.order_id;
    if v_ws is null then
      raise exception 'order is not scoped to a workspace' using errcode = '42501';
    end if;
    if v_status not in ('new', 'assigned', 'calculated') then
      raise exception 'rates are closed for order in status %', v_status using errcode = '22023';
    end if;
    new.workspace_id := v_ws;
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.status := 'active';
    new.withdrawn_at := null;
    new.created_at := now();
    return new;
  end if;
  -- UPDATE: only active -> withdrawn, nothing else changes.
  if old.status <> 'active' or new.status <> 'withdrawn'
     or (new.order_id, new.workspace_id, new.carrier, new.amount, new.currency,
         new.valid_until, new.comment, new.created_by, new.created_at)
        is distinct from
        (old.order_id, old.workspace_id, old.carrier, old.amount, old.currency,
         old.valid_until, old.comment, old.created_by, old.created_at) then
    raise exception 'a rate can only be withdrawn' using errcode = '42501';
  end if;
  new.withdrawn_at := now();
  return new;
end
$function$;

drop trigger if exists rate_quotes_guard on public.rate_quotes;
create trigger rate_quotes_guard before insert or update on public.rate_quotes
  for each row execute function public.rate_quotes_guard();

drop policy if exists rate_quotes_select on public.rate_quotes;
drop policy if exists rate_quotes_insert on public.rate_quotes;
drop policy if exists rate_quotes_update on public.rate_quotes;
create policy rate_quotes_select on public.rate_quotes for select to authenticated
  using (public.can_manage_order(order_id));
create policy rate_quotes_insert on public.rate_quotes for insert to authenticated
  with check (public.can_manage_order(order_id));
create policy rate_quotes_update on public.rate_quotes for update to authenticated
  using (public.can_manage_order(order_id)
         and (created_by = auth.uid() or public.has_workspace_role(workspace_id, array['manager', 'tenant_admin'])))
  with check (public.can_manage_order(order_id));

revoke all on public.rate_quotes from anon, authenticated;
grant select on public.rate_quotes to authenticated;
grant insert (order_id, carrier, amount, currency, valid_until, comment) on public.rate_quotes to authenticated;
grant update (status) on public.rate_quotes to authenticated;

-- Rule: a scoped order may become "calculated" only with at least two active rates.
create or replace function public.orders_min_rates_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status = 'calculated' and old.status is distinct from 'calculated'
     and new.workspace_id is not null
     and (select count(*) from public.rate_quotes r
          where r.order_id = new.id and r.status = 'active') < 2 then
    raise exception 'at least two active rates are required' using errcode = '23514';
  end if;
  return new;
end
$function$;

drop trigger if exists orders_min_rates_guard on public.orders;
create trigger orders_min_rates_guard before update of status on public.orders
  for each row execute function public.orders_min_rates_guard();
