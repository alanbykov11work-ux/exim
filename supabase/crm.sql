-- ============================================================
-- EXIM CRM: лиды и воронка продаж
-- ============================================================
create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  ref         text unique not null,
  name        text not null default '',          -- контактное лицо
  company     text default '',
  phone       text default '',
  email       text default '',
  source      text not null default 'manual' check (source in
    ('site','whatsapp','call','referral','manual','other')),
  title       text default '',                   -- суть запроса (маршрут, груз)
  amount      numeric,                           -- потенциальная сумма, ₸
  stage       text not null default 'new' check (stage in
    ('new','qualified','proposal','negotiation','won','lost')),
  lost_reason text default '',
  note        text default '',
  owner_id    uuid references public.profiles (id),   -- ответственный менеджер
  created_by  uuid references public.profiles (id),
  order_id    uuid references public.orders (id),     -- созданная из лида заявка
  stage_changed_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.lead_history (
  id         bigint generated always as identity primary key,
  lead_id    uuid not null references public.leads (id) on delete cascade,
  actor_id   uuid,
  action     text not null,
  snapshot   jsonb not null default '{}',
  created_at timestamptz not null default now()
);

drop trigger if exists trg_leads_touch on public.leads;
create trigger trg_leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();

alter table public.leads enable row level security;
alter table public.lead_history enable row level security;

-- Лиды видит и ведёт только персонал (менеджеры и админы)
drop policy if exists "leads staff" on public.leads;
create policy "leads staff" on public.leads for all
  using (public.is_manager()) with check (public.is_manager());

drop policy if exists "lead history staff" on public.lead_history;
create policy "lead history staff" on public.lead_history for all
  using (public.is_manager()) with check (public.is_manager());

select 'CRM OK' as result;
