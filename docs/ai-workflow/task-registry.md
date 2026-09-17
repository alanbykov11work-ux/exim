# Реестр application-задач

| ID | Название | Статус | Product OS ref | Application baseline | Последняя сдача | Следующее действие |
|---|---|---|---|---|---|---|
| `REPO-BOOTSTRAP-001` | Настройка совместной работы | `completed` | `0306844` | Пустой репозиторий | Initial coordination commit | Импорт существующего приложения |
| `TASK-2026-001` | Foundation Gate — безопасный Private OS core | `superseded` | `product-os-task-2026-001-r1` | `64017a5d46ab54eae492fc9b0e2987e214f81782` | `ea049dc` local/source baseline | Foundation changes сохранены в TASK-2026-002; Supabase blocker отменён новой owner directive |
| `TASK-2026-002` | Self-hosted PostgreSQL preview | `submitted` | `product-os-task-2026-001-r1` (scope reference) | `ea049dca75e3a2e0f1e936156ab8c7fc80091e7a` | `SUB-TASK-2026-002-02`, PR [#6](https://github.com/alanbykov11work-ux/exim/pull/6), app `2a14083` | Независимый review attempt 02; затем отдельное human acceptance решение |

## Правила

- Подробный продуктовый scope не дублируется здесь: он живёт в закреплённом Product OS.
- Одновременно активна только одна application-задача.
- Исполнитель не меняет статус на `accepted` и не делает следующую задачу текущей.
- Изменение scope или baseline фиксируется отдельным commit и в истории `current-task.md`.
