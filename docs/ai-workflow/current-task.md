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
| Implementation branch | `task/TASK-2026-001-integrated` (все незамерженные волны Wave 1 → 4b + исправления review 2026-10-08) |
| Code head | `563b23cae890e417825be8d6676a3744ea0f61cd` (submission-03) |
| Target environment | Локальный non-production стек (PostgreSQL 16 + PostgREST 12, `scripts/local-stack/`), PGlite, MOCK-браузер; hosted Preview/test Supabase `BLOCKED` — blocker-02 |
| Production deploy | `FORBIDDEN` |
| Последняя сдача | `reports/TASK-2026-001/submission-03.md`, `evidence-manifest-03.md` (PR #8) |
| Следующее действие | Независимый review PR интегрированной ветки; интегратор создаёт test Supabase + Preview (blocker-02); затем hosted-проверки семью аккаунтами |

## Текущая граница выполнения

Исходный код, manifests и SQL импортированы в `main`. Реализацию ведёт Claude по поручению владельца (Issue #5); Codex выполняет независимый review. Локальная работа и проверки разрешены; production, реальные данные и секреты запрещены. Применение SQL, семь role/scope accounts и hosted Preview остаются `BLOCKED`, пока не подтверждён отдельный test Supabase project.

## Проверенный preflight

- origin: `https://github.com/alanbykov11work-ux/exim.git`;
- clean base: `main` @ `64017a5d46ab54eae492fc9b0e2987e214f81782`;
- stack (manifests ветки): Next.js 15.5.27 / React 18.3.1 / TypeScript 5.9 / Supabase;
- Product OS: `product-os-task-2026-001-r1` @ `0306844716ed0ed69033e264f5398b1e992a2851`, read-only;
- baseline build и typecheck проходят с process-only placeholder public Supabase values;
- production deployment не выполняется.

## История

| Дата | Было | Стало | Actor | Причина |
|---|---|---|---|---|
| 2026-09-17 | `awaiting_application_source` | `in_progress` | Codex task curator по прямому поручению владельца | Source подтверждён на exact baseline; разрешена локальная реализация без production |
| 2026-10-13 | ветка `foundation-wave-1`, Next 14, действие «Codex реализует Wave 1» | ветка `task/TASK-2026-001-integrated` @ `64843fd`, Next 15.5.27, submission-01 | Claude task curator (Issue #5) | Исправления по Codex review 2026-10-08, одна интегрированная сдача; статус остаётся `in_progress` |
| 2026-10-14 | head `64843fd`, submission-01 | head `c066519`: 4c/5a влиты fast-forward, исправление `exim.trusted`, Wave 5b, локальный стек; submission-02 | Claude task curator (Issue #5, поручение 2026-10-13) | Статус остаётся `in_progress`; приёмки нет |

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
| 2026-10-16 | submission-02 @ `c066519` | submission-03 @ `563b23c`: сквозной сценарий настоящего SPA на локальном backend | Claude task curator | Статус `in_progress`; приёмки нет |
