---
report_id: SUB-TASK-2026-003-01
task_id: TASK-2026-003
task_revision: 2
submission_attempt: 1
submitted_by: Codex implementation agent
submitted_at: 2026-09-17T16:34:56+05:00
product_os_ref: product-os-task-2026-003-r2 / f783667681e81ba6368b09558f89bacdf7587def
app_repository: https://github.com/alanbykov11work-ux/exim.git
app_branch: task/TASK-2026-003-release-foundation-identity
app_commit: afc85f6feb6dda989b6efda8aec6d5b1a0527e86
report_commit: report-only commit in branch history; not part of preview runtime
pull_request: https://github.com/alanbykov11work-ux/exim/pull/7
preview_url: https://superapp.185-129-49-242.sslip.io/app
preview_deployment_id: exim-superapp:afc85f6feb6dda989b6efda8aec6d5b1a0527e86 / sha256:7f207ab173a704b02263d1edc62ee2447ca5ab2067541330e4ba130efa1ea057
status: submitted
---

# Submission report — attempt 01

Это отчёт исполнителя, а не независимый review и не human acceptance. Он описывает exact application commit `afc85f6feb6dda989b6efda8aec6d5b1a0527e86`. Последующий report-only commit не меняет развернутый runtime.

## Фактический результат

- Сессия хранит выбранную membership и не может ссылаться на membership другого пользователя.
- При нескольких контекстах роль больше не повышается автоматически: пользователь явно выбирает компанию и роль на `/select-context`.
- GET/POST `/api/access-context` возвращает и принимает только собственные memberships пользователя; смена защищена same-origin проверкой.
- Переключение контекста выполняется транзакционно и записывается в audit прежнего и нового tenant, где это применимо.
- Все Private OS runtime API используют server-derived context и общий guard `private_os`.
- Client projection не содержит внутренних ставок, маржи, подрядчика, перевозчика, водителя и staff-полей. Logistician projection не содержит цены клиенту, решения клиента и маржи.
- Создан CI-процесс с locked install, typecheck, lint, tests и production build.
- Ветка создана поверх TASK-2026-002 и оформлена отдельным stacked PR #7; PR #6 не изменён новой волной.

## Миграция и rollback

- Migration: `db/migrations/0002_explicit_access_context.sql`.
- Перед apply создан server backup `/backups/exim-superapp-20260917T111740Z.dump`.
- Apply прошёл; повторный запуск подтвердил, что `0001` и `0002` уже применены и не выполняются повторно.
- Миграция аддитивная: добавляет nullable `active_membership_id` и составной FK к membership того же пользователя.
- Rollback приложения: вернуть предыдущий release/image. Полный data rollback: восстановить указанный backup в отдельной проверочной среде и переключить release только после проверки целостности.

## Проверки

| Проверка | Результат |
|---|---|
| `npm test` | PASS `22/22` |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS, 24 routes |
| GitHub CI exact head | PASS |
| Migration apply/reapply | PASS |
| Public `/api/health` + database | PASS |
| Browser: login → chooser → manager `/app` | PASS |
| A1/A2/B1 tenant/client isolation | PASS |
| Семь synthetic role accounts | PASS `7/7` |
| Чужая membership при context switch | HTTP `404` |
| Отключённый `private_os` entitlement | HTTP `403`; затем entitlement восстановлен |
| Hub и EximDaily containers | healthy, общей DB/сессии не добавлено |

## Acceptance criteria

| AC ID | Результат исполнителя | Evidence ID | Комментарий |
|---|---|---|---|
| AC-003-01 | PASS_BY_IMPLEMENTER | EVID-003-01, EVID-003-02 | Составной FK и negative DB test |
| AC-003-02 | PASS_BY_IMPLEMENTER | EVID-003-03, EVID-003-07 | Без role priority, browser chooser |
| AC-003-03 | PASS_BY_IMPLEMENTER | EVID-003-03, EVID-003-06 | Own contexts, same-origin, foreign membership 404 |
| AC-003-04 | PASS_BY_IMPLEMENTER | EVID-003-04, EVID-003-06 | API guards и role-safe projection |
| AC-003-05 | PASS_BY_IMPLEMENTER | EVID-003-03, EVID-003-06 | Audit записывается без credentials/PII |
| AC-003-06 | PASS_BY_IMPLEMENTER | EVID-003-06 | Матрица 7/7, A1/A2/B1 |
| AC-003-07 | PASS_BY_IMPLEMENTER | EVID-003-04, EVID-003-06 | Server-side entitlement 403 |
| AC-003-08 | PASS_BY_IMPLEMENTER | EVID-003-01, EVID-003-05, EVID-003-08 | CI/local/migration/secret scan |
| AC-003-09 | PASS_BY_IMPLEMENTER | EVID-003-06 | Exact image digest, соседние сервисы healthy |
| AC-003-10 | PASS_BY_IMPLEMENTER | EVID-003-08 | Stacked PR #7, no self-merge |

## Известные ограничения

- Manager dashboard пока показывает нулевые counts при наличии demo orders в API. Это не скрыто и переносится в следующую волну `stable shell + server-side domain read model`.
- Legacy business write paths остаются fail-closed до перехода на доменные server API.
- Exchange, billing и реальные коммерческие цены не реализовывались в этой task.
- Все суммы и наполнение preview — синтетическая демонстрационная ширма, не коммерческое предложение и не реальные клиентские данные.
- Независимый review и human acceptance не выполнены.

## Безопасность

- Production deploy и production-data writes не выполнялись.
- В отчёт не включены credentials, cookies, tokens, `.env` или реальные персональные данные.
- Product OS не изменялся application PR.
- QA credentials хранятся локально в DPAPI-защищённом файле вне репозитория.
