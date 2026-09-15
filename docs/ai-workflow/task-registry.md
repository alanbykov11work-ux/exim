# Реестр application-задач

| ID | Название | Статус | Product OS ref | Application baseline | Последняя сдача | Следующее действие |
|---|---|---|---|---|---|---|
| `REPO-BOOTSTRAP-001` | Настройка совместной работы | `completed` | `0306844` | Пустой репозиторий | Initial coordination commit | Импорт существующего приложения |
| `TASK-2026-001` | Foundation Gate — безопасный Private OS core | `awaiting_application_source` | `product-os-task-2026-001-r1` | `SET_AFTER_APPLICATION_SOURCE_IMPORT` | — | Import PR → audit → exact baseline → ready |

## Правила

- Подробный продуктовый scope не дублируется здесь: он живёт в закреплённом Product OS.
- Одновременно активна только одна application-задача.
- Исполнитель не меняет статус на `accepted` и не делает следующую задачу текущей.
- Изменение scope или baseline фиксируется отдельным commit и в истории `current-task.md`.
