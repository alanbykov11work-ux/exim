# Текущий этап

| Поле | Значение |
|---|---|
| Application repository | `https://github.com/alanbykov11work-ux/exim.git` |
| Base branch | `main` |
| Состояние репозитория | Application source импортирован и проверен локально |
| Статус | `in_progress` |
| Current product task | `TASK-2026-001` — Foundation Gate |
| Product OS ref | `product-os-task-2026-001-r1` / `0306844716ed0ed69033e264f5398b1e992a2851` |
| Application baseline SHA | `64017a5d46ab54eae492fc9b0e2987e214f81782` |
| Implementation branch | `task/TASK-2026-001-foundation-wave-1` |
| Target environment | Локальная source-only проверка; отдельный Preview/test Supabase ещё `BLOCKED` |
| Production deploy | `FORBIDDEN` |
| Следующее действие | Codex реализует и проверяет Wave 1; hosted RLS/E2E не выдаются за выполненные до появления test Supabase |

## Текущая граница выполнения

Исходный код, manifests и SQL импортированы в `main`. Владелец поручил Codex продолжить реализацию напрямую. Локальная работа и проверки разрешены; production, реальные данные и секреты запрещены. Применение SQL, семь role/scope accounts и hosted Preview остаются `BLOCKED`, пока не подтверждён отдельный test Supabase project.

## Проверенный preflight

- origin: `https://github.com/alanbykov11work-ux/exim.git`;
- clean base: `main` @ `64017a5d46ab54eae492fc9b0e2987e214f81782`;
- stack: Next.js 14 / React 18 / TypeScript / Supabase;
- Product OS: `product-os-task-2026-001-r1` @ `0306844716ed0ed69033e264f5398b1e992a2851`, read-only;
- baseline build и typecheck проходят с process-only placeholder public Supabase values;
- production deployment не выполняется.

## История

| Дата | Было | Стало | Actor | Причина |
|---|---|---|---|---|
| 2026-09-17 | `awaiting_application_source` | `in_progress` | Codex task curator по прямому поручению владельца | Source подтверждён на exact baseline; разрешена локальная реализация без production |

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
