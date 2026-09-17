# TASK-2026-002 — Self-hosted PostgreSQL preview

Статус: `in_progress`
Baseline: `ea049dca75e3a2e0f1e936156ab8c7fc80091e7a`
Branch: `task/TASK-2026-002-self-hosted-postgres`
Environment: managed preview, synthetic data only

## Цель

Развернуть существующую EXIM Super App отдельным сервисом на managed server рядом с Hub и Daily, убрать runtime-зависимость от Supabase и доказать переносимость PostgreSQL/документов без регрессии соседних сервисов.

## Обязательные acceptance criteria

| ID | Критерий |
|---|---|
| AC-002-01 | Hub, Daily и Super App имеют отдельные процессы, базы, volumes и секреты; PostgreSQL Super App не имеет host-port. |
| AC-002-02 | Caddy видит Super App только через отдельную edge-сеть; web Super App не подключён к внутренней сети Hub. |
| AC-002-03 | Runtime не использует Supabase packages, public keys, Auth, PostgREST или Storage. |
| AC-002-04 | Регистрация атомарно создаёт user/profile/organization/workspace/client company/client membership. |
| AC-002-05 | Login, session cookie, logout и server-side membership guard работают; rate limit включён. |
| AC-002-06 | State/profile/documents пишутся через server API; браузер не получает DATABASE_URL. |
| AC-002-07 | A1/A2/B1 negative tests не допускают чтение чужого workspace/client company. |
| AC-002-08 | Миграция с нуля проходит в реальном PostgreSQL 16 и повторный запуск безопасен. |
| AC-002-09 | `pg_dump -Fc`, checksum и restore drill в отдельную test database проходят. |
| AC-002-10 | Hub и Daily health проверены до и после; существующие containers/data не изменены. |
| AC-002-11 | Неперенесённые write-модули не делают ложный success и preview не называется production-ready. |
| AC-002-12 | В сдаче указаны exact app commit/image, server release path, URL, tests, ограничения и rollback. |

## Не входит

- реальные клиенты/документы;
- публичный production cutover;
- общая база с Hub;
- SSO, общие cookies или скрытая синхронизация;
- Exchange/ATI.SU;
- перенос внешних данных без предоставленного владельцем dump/export;
- SMTP до выбора провайдера.
