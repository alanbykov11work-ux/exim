# Реестр application-задач

| ID | Название | Статус | Product OS ref | Application baseline | Последняя сдача | Следующее действие |
|---|---|---|---|---|---|---|
| `REPO-BOOTSTRAP-001` | Настройка совместной работы | `completed` | `0306844` | Пустой репозиторий | Initial coordination commit | Импорт существующего приложения |
| `TASK-2026-001` | Foundation Gate — безопасный Private OS core | `in_progress` | `product-os-task-2026-001-r1` | `64017a5d46ab54eae492fc9b0e2987e214f81782` | submission-04 @ `ef0a834`, report `6c7b5e5` (2026-11-10) | Исправления и безопасный выпуск разрешены владельцем 2026-11-16 по deployment-policy.md; нового разрешения Codex не требуется |

## Правила

- Подробный продуктовый scope не дублируется здесь: он живёт в закреплённом Product OS.
- Одновременно активна только одна application-задача.
- Исполнитель не меняет статус на `accepted` и не делает следующую задачу текущей.
- Изменение scope или baseline фиксируется отдельным commit и в истории `current-task.md`.

## Публикация

См. [deployment-policy.md](deployment-policy.md): статусы и ожидание reviewer не блокируют разрешённый выпуск. Сохраняются реальные safety gates и честная отдельная приёмка продукта.
