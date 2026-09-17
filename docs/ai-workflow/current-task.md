# Текущий этап

| Поле | Значение |
|---|---|
| Application repository | `https://github.com/alanbykov11work-ux/exim.git` |
| Статус | `in_progress` |
| Current application task | `TASK-2026-002` — self-hosted PostgreSQL preview |
| Product OS ref | `product-os-task-2026-001-r1` / `0306844716ed0ed69033e264f5398b1e992a2851` — read-only product scope |
| Application baseline | `ea049dca75e3a2e0f1e936156ab8c7fc80091e7a` |
| Implementation branch | `task/TASK-2026-002-self-hosted-postgres` |
| Target environment | отдельный managed preview `superapp.185-129-49-242.sslip.io` |
| Data class | только синтетические test data; реальные клиентские данные запрещены |
| Production switch | `FORBIDDEN` до отдельной приёмки владельца |
| Следующее действие | завершить isolated deploy, backup/restore drill, auth/tenant E2E и отчёт |

## Owner directive

17 сентября 2026 владелец прямо поручил скопировать текущую Super App на существующий managed server, развернуть её отдельным сервисом и заменить Supabase на переносимую SQL-базу на сервере. Это более новое указание отменяет прежний технический blocker «нужен test Supabase», но не разрешает смешивать базы Hub/Super App, использовать реальные данные или переключать публичный production origin.

## Граница выполнения

- отдельный Compose project, PostgreSQL, документы, секреты и backups;
- Next.js остаётся приложением и server-side API;
- Hub и Super App не объединяются; первый контракт остаётся link-first;
- Foundation Wave 1 изменения из `ea049dc` сохранены как база этой ветки;
- старые `supabase/**` остаются историческими, runtime Supabase удаляется;
- первый deploy может быть только честным preview: неподключённые write-модули явно блокируются.

## История

| Дата | Было | Стало | Actor | Причина |
|---|---|---|---|---|
| 2026-09-17 | `TASK-2026-001 in_progress` | `TASK-2026-002 in_progress` | Codex task curator по прямому поручению владельца | Владелец выбрал самостоятельный managed server и PostgreSQL вместо ожидания Supabase/integrator |
