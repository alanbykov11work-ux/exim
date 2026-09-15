# Текущий этап

| Поле | Значение |
|---|---|
| Application repository | `https://github.com/alanbykov11work-ux/exim.git` |
| Base branch | `main` |
| Состояние репозитория | Координационный каркас; application source отсутствует |
| Статус | `awaiting_application_source` |
| Planned product task | `TASK-2026-001` — Foundation Gate |
| Product OS ref | `product-os-task-2026-001-r1` / `0306844716ed0ed69033e264f5398b1e992a2851` |
| Application baseline SHA | `SET_AFTER_APPLICATION_SOURCE_IMPORT` |
| Target environment | `SET_AFTER_DEPLOYMENT_LINKAGE_VERIFICATION` |
| Production deploy | `FORBIDDEN` |
| Следующее действие | Интегратор загружает существующий Super App через `import/application-baseline` PR |

## Почему реализация ещё не стартует

В GitHub пока нет исходного кода работающего приложения, manifests, миграций и тестов. Без них нельзя доказать стек, baseline и связь с Preview. Claude запрещено закрывать этот пробел новым scaffold или кодом другого проекта.

## Автоматический переход к работе

После merge исходного приложения task curator проверяет код и заменяет оба `SET_AFTER_...` точными значениями. Если дерево чистое, Preview/test-среда безопасна и противоречий нет, статус меняется на `ready`. После этого Claude начинает `TASK-2026-001` без нового общего разрешения владельца.

## Обязательное чтение перед TASK-2026-001

В закреплённом Product OS полностью прочитать:

- `README.md` и `AGENTS.md`;
- `docs/12-delivery/README.md`;
- `docs/12-delivery/current-task.md`;
- `docs/12-delivery/tasks/TASK-2026-001-foundation-gate.md`;
- `docs/01-foundation/product-foundation.md`;
- `docs/01-foundation/decisions.md`;
- `docs/09-decisions/open-questions.md`;
- `docs/06-requirements/index.md` и `REQ-001`…`REQ-006`;
- `docs/04-pages/foundation-gate-contracts.md`;
- `docs/07-mvp/foundation-gate.md`;
- `docs/10-implementation/current-state.md`;
- `docs/10-implementation/audits/2026-09-04-super-app-live-audit.md`.
