# TASK-2026-001 — Wave 1b migration plan

## Что добавляет миграция

`supabase/foundation_wave_1b_legacy_scope.sql` подключает существующие объекты Private OS к tenant-контуру Wave 1:
`orders`, `order_finance`, `order_history`, `transports`, `trips`, `trip_events`, `transport_updates`.

- `workspace_id` во всех семи таблицах; `client_company_id` в `orders` и `transports` с составным внешним ключом на `client_companies(id, workspace_id)`;
- все прежние политики этих таблиц удаляются: они доверяли глобальному `profiles.role` и не имели границы workspace;
- новые политики: клиент — только своя client company, логист — только назначенные ему объекты, менеджер и tenant admin — свой workspace;
- колоночная защита: `total_price`, `offer_comment` и `calc_comment` не выбираются из таблицы напрямую ни одной API-ролью и отдаются только функцией `orders_scoped()` по роли вызывающего;
- рейсы и внутренние события — только персоналу; клиент читает безопасный слой через `client_trips()`;
- защита от записи при отключённом entitlement `private_os`;
- scope объекта неизменяем; дочерние строки наследуют scope родителя триггером;
- DELETE не выдаётся ни на одну из таблиц; `order_history` — только чтение и добавление.

CRM, задачи и чаты в эту миграцию не входят и остаются на прежних политиках — это следующий пакет.

## Поведение существующих строк

Миграция fail-closed. Строка без `workspace_id` после применения **не видна ни одной API-роли**, включая автора. Scope не выводится из email, названия компании или роли в профиле.

Назначение scope выполняет владелец по одной заявке:

```sql
select public.legacy_assign_order_scope(
  '<order id>', '<workspace id>', '<client company id>', '<причина>'
);
```

Функция проверяет принадлежность client company к workspace, каскадно проставляет scope финансам, истории, перевозкам, рейсам, событиям и публикациям заявки, отказывает при повторном вызове и пишет событие `legacy.order_scope_assigned` в `tenant_audit_events`. API-ролям `anon` и `authenticated` выполнение запрещено.

## Влияние на данные

- Ни одна бизнес-строка не удаляется и не переписывается; добавляются только nullable-колонки, индексы, ограничения, триггеры и политики.
- До backfill существующие заявки и перевозки недоступны через приложение. На production это означает простой рабочего контура — применять только после репетиции на копии данных и с готовым списком назначений.

## Безопасное применение

1. Только отдельный Supabase test/Preview project.
2. Backup и schema dump до применения.
3. Порядок: `workflow.sql` → `foundation_wave_1.sql` → `foundation_wave_1b_legacy_scope.sql`, одной транзакцией.
4. Включить `private_os` в `module_entitlements` тестовых workspace.
5. Проверить изоляцию отдельными сессиями семи аккаунтов и прямыми REST-запросами.

## Rollback

До backfill: отдельной reviewed-миграцией вернуть прежние политики и привилегии, удалить триггеры и функции Wave 1b; колонки `workspace_id` и `client_company_id` можно оставить — они nullable и не мешают прежней схеме. После backfill автоматический destructive rollback запрещён: откат — восстановлением test backup либо отдельной reviewed-миграцией. Production rollback в этой task не разрешён.

## Что проверено и что нет

Проверено автоматически на PostgreSQL-совместимом движке (PGlite), `test/foundation-wave-1b-db.test.mjs`: изоляция workspace, client company и назначений; отсутствие цены и себестоимости в запрещённых ответах; запрет прямого чтения чувствительных колонок; правила обновления по ролям; неизменяемость scope; append-only история; наследование scope перевозками; закрытость рейсов и внутренних событий; блокировка записи при отключённом entitlement; fail-closed поведение legacy-строк и backfill с аудитом.

`BLOCKED`: применение на реальном Supabase, проверка под семью аккаунтами через REST и hosted Preview — отдельного test Supabase project нет. Поведение PostgREST, Realtime и Storage PGlite не воспроизводит.
