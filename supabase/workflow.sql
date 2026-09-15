-- ============================================================
-- EXIM Super App — рабочие циклы (заявки, расчёты, перевозки)
-- Выполнить в Supabase → SQL Editor
-- ============================================================

-- ---------- ЦИКЛ 1: заявки и расчёты ----------
create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  ref           text unique not null,
  client_id     uuid not null references public.profiles (id),
  created_by    uuid not null references public.profiles (id),
  origin        text not null,
  destination   text not null,
  transport     text default '',        -- авто/жд/море/авиа
  cargo         text default '',
  weight        text default '',
  container     text default '',
  comment       text default '',
  status        text not null default 'new' check (status in
    ('new','assigned','calculated','offer_sent','approved','rejected','contract_signed','converted','archived')),
  logist_id     uuid references public.profiles (id),
  calc_deadline timestamptz,
  -- расчёт логиста (без сумм — суммы в order_finance)
  calc_route    text default '',
  calc_days     text default '',
  calc_comment  text default '',
  calc_submitted_at timestamptz,
  -- предложение клиенту (итоговая цена видна клиенту после отправки)
  total_price   numeric,
  offer_comment text default '',
  offer_sent_at timestamptz,
  client_decision text check (client_decision in ('approved','rejected')),
  client_decision_at timestamptz,
  contract_signed_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Финансовые данные — ОТДЕЛЬНАЯ таблица: клиент её не видит вообще
create table if not exists public.order_finance (
  order_id  uuid primary key references public.orders (id) on delete cascade,
  cost      numeric,            -- себестоимость (логист)
  expenses  jsonb default '[]', -- расходы [{name, amount}]
  margin    numeric,            -- маржа (менеджер)
  updated_at timestamptz not null default now()
);

-- История расчётов: ничего не удаляется бесследно
create table if not exists public.order_history (
  id         bigint generated always as identity primary key,
  order_id   uuid not null references public.orders (id) on delete cascade,
  actor_id   uuid,
  action     text not null,
  snapshot   jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------- ЦИКЛ 2: перевозки, рейсы, события ----------
create table if not exists public.transports (
  id          uuid primary key default gen_random_uuid(),
  ref         text unique not null,
  order_id    uuid references public.orders (id),
  client_id   uuid not null references public.profiles (id),
  manager_id  uuid references public.profiles (id),
  logist_id   uuid references public.profiles (id),
  origin      text not null,
  destination text not null,
  status      text not null default 'preparing' check (status in
    ('preparing','loading','in_transit','customs','delivering','delivered','archived')),
  progress    int not null default 5,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.trips (
  id           uuid primary key default gen_random_uuid(),
  transport_id uuid not null references public.transports (id) on delete cascade,
  name         text not null,           -- «Машина 1 · DAF 123ABC01»
  driver       text default '',
  status       text not null default 'active',
  created_at   timestamptz not null default now()
);

-- Внутренние события (логист → менеджер). Клиент их НЕ видит.
create table if not exists public.trip_events (
  id           bigint generated always as identity primary key,
  transport_id uuid not null references public.transports (id) on delete cascade,
  trip_id      uuid references public.trips (id) on delete set null,
  internal_text text not null,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  processed    boolean not null default false
);

-- Публичная лента для клиента (тексты, написанные менеджером)
create table if not exists public.transport_updates (
  id           bigint generated always as identity primary key,
  transport_id uuid not null references public.transports (id) on delete cascade,
  source_event bigint references public.trip_events (id),
  public_text  text not null,
  published_by uuid,
  created_at   timestamptz not null default now()
);

-- ---------- Автообновление updated_at ----------
drop trigger if exists trg_orders_touch on public.orders;
create trigger trg_orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_transports_touch on public.transports;
create trigger trg_transports_touch before update on public.transports
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_order_finance_touch on public.order_finance;
create trigger trg_order_finance_touch before update on public.order_finance
  for each row execute function public.touch_updated_at();

-- ---------- Роли-помощники ----------
create or replace function public.is_manager()
returns boolean language sql security definer set search_path = public stable
as $f$ select exists (select 1 from public.profiles where id = auth.uid() and role in ('manager','admin')) $f$;

create or replace function public.is_logist()
returns boolean language sql security definer set search_path = public stable
as $f$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'logist') $f$;

-- ---------- RLS ----------
alter table public.orders enable row level security;
alter table public.order_finance enable row level security;
alter table public.order_history enable row level security;
alter table public.transports enable row level security;
alter table public.trips enable row level security;
alter table public.trip_events enable row level security;
alter table public.transport_updates enable row level security;

-- ЗАЯВКИ: клиент видит свои; логист — назначенные ему; менеджер — все
drop policy if exists "orders read" on public.orders;
create policy "orders read" on public.orders for select using (
  client_id = auth.uid() or logist_id = auth.uid() or public.is_manager()
);
drop policy if exists "orders insert" on public.orders;
create policy "orders insert" on public.orders for insert with check (
  created_by = auth.uid() and (client_id = auth.uid() or public.is_manager())
);
drop policy if exists "orders update staff" on public.orders;
create policy "orders update staff" on public.orders for update using (
  public.is_manager() or logist_id = auth.uid()
);
drop policy if exists "orders update client decision" on public.orders;
create policy "orders update client decision" on public.orders for update using (
  client_id = auth.uid() and status = 'offer_sent'
);

-- ФИНАНСЫ: только персонал (клиент не видит себестоимость и маржу)
drop policy if exists "finance staff only" on public.order_finance;
create policy "finance staff only" on public.order_finance for all using (
  public.is_manager()
  or exists (select 1 from public.orders o where o.id = order_id and o.logist_id = auth.uid())
) with check (
  public.is_manager()
  or exists (select 1 from public.orders o where o.id = order_id and o.logist_id = auth.uid())
);

-- ИСТОРИЯ: персонал читает, пишут все причастные
drop policy if exists "history read staff" on public.order_history;
create policy "history read staff" on public.order_history for select using (
  public.is_manager()
  or exists (select 1 from public.orders o where o.id = order_id and (o.logist_id = auth.uid() or o.client_id = auth.uid()))
);
drop policy if exists "history insert" on public.order_history;
create policy "history insert" on public.order_history for insert with check (
  exists (select 1 from public.orders o where o.id = order_id
          and (o.client_id = auth.uid() or o.logist_id = auth.uid() or public.is_manager()))
);

-- ПЕРЕВОЗКИ: клиент свои, логист свои, менеджер все
drop policy if exists "transports read" on public.transports;
create policy "transports read" on public.transports for select using (
  client_id = auth.uid() or logist_id = auth.uid() or public.is_manager()
);
drop policy if exists "transports write staff" on public.transports;
create policy "transports write staff" on public.transports for all using (
  public.is_manager() or logist_id = auth.uid()
) with check (public.is_manager() or logist_id = auth.uid());

-- РЕЙСЫ: видят все причастные, пишет персонал
drop policy if exists "trips read" on public.trips;
create policy "trips read" on public.trips for select using (
  exists (select 1 from public.transports t where t.id = transport_id
          and (t.client_id = auth.uid() or t.logist_id = auth.uid() or public.is_manager()))
);
drop policy if exists "trips write staff" on public.trips;
create policy "trips write staff" on public.trips for all using (
  exists (select 1 from public.transports t where t.id = transport_id
          and (t.logist_id = auth.uid() or public.is_manager()))
) with check (
  exists (select 1 from public.transports t where t.id = transport_id
          and (t.logist_id = auth.uid() or public.is_manager()))
);

-- ВНУТРЕННИЕ СОБЫТИЯ: только персонал (клиент не видит)
drop policy if exists "trip_events staff" on public.trip_events;
create policy "trip_events staff" on public.trip_events for all using (
  public.is_manager()
  or exists (select 1 from public.transports t where t.id = transport_id and t.logist_id = auth.uid())
) with check (
  public.is_manager()
  or exists (select 1 from public.transports t where t.id = transport_id and t.logist_id = auth.uid())
);

-- ПУБЛИЧНАЯ ЛЕНТА: клиент читает свои, пишет менеджер
drop policy if exists "updates read" on public.transport_updates;
create policy "updates read" on public.transport_updates for select using (
  exists (select 1 from public.transports t where t.id = transport_id
          and (t.client_id = auth.uid() or t.logist_id = auth.uid() or public.is_manager()))
);
drop policy if exists "updates write manager" on public.transport_updates;
create policy "updates write manager" on public.transport_updates for insert with check (public.is_manager());
