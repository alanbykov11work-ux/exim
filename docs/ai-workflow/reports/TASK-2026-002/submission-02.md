---
report_id: SUB-TASK-2026-002-02
task_id: TASK-2026-002
task_revision: 1
submission_attempt: 2
submitted_by: Codex implementation agent
submitted_at: 2026-09-17T14:57:21+05:00
product_os_ref: product-os-task-2026-001-r1 / 0306844716ed0ed69033e264f5398b1e992a2851
app_repository: https://github.com/alanbykov11work-ux/exim.git
app_branch: task/TASK-2026-002-self-hosted-postgres
app_commit: 2a140832b81a363c4589a6b781b12ed4cc67d1ed
pull_request: https://github.com/alanbykov11work-ux/exim/pull/6
preview_url: https://superapp.185-129-49-242.sslip.io/app
preview_deployment_id: exim-superapp:2a140832b81a363c4589a6b781b12ed4cc67d1ed / sha256:6e29b2f488203497bc3e9dba247c7acec06d3938072b15318c1668cb47cdb6ee
status: submitted
---

# Submission report — attempt 02

> Это исправленная сдача после фактического пользовательского воспроизведения. Она не является независимой проверкой или human acceptance.

## Причина нового attempt

На публичной странице регистрации пользователь получил `403` с сообщением «Недопустимый источник запроса». Reverse proxy передавал браузерный `Origin` внешнего HTTPS-домена, а Next.js видел внутренний container origin. Предыдущий public smoke без браузерного `Origin` не обнаружил этот дефект.

## Исправление

- Same-origin policy теперь сравнивает браузерный `Origin` с внутренним request origin и с каноническим `APP_BASE_URL`.
- `x-forwarded-host` и другие клиентские forwarded headers не используются как источник доверия.
- Иностранный, malformed или содержащий path `Origin` остаётся запрещённым.
- Добавлены пять regression tests для direct, reverse-proxy, foreign, malformed и no-Origin сценариев.

## Проверки

| Сценарий | Результат |
|---|---|
| `npm test` | PASS `17/17` |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, 0 warnings/errors |
| `npm run build` | PASS |
| External canonical Origin + invalid payload | HTTP `400` validation; origin принят корректно |
| Foreign Origin | HTTP `403` «Недопустимый источник запроса» |
| Public server smoke | PASS: registration, session, state, documents, tenant denial, workflow read, callback, logout |
| Container health | `healthy` |

## Acceptance impact

AC-002-04, AC-002-05 и AC-002-12 повторно заявлены `PASS_BY_IMPLEMENTER` для exact commit `2a140832b81a363c4589a6b781b12ed4cc67d1ed`. Остальные claims submission-01 не изменялись.

## Остаточные ограничения

- Независимый review и human acceptance всё ещё не выполнены.
- SMTP, полный password reset и неподдержанные business write-flow остаются вне текущего preview scope.
- Browser-origin regression теперь автоматизирован, но реальный пользовательский пароль не собирался и не сохранялся.

## Rollback

Вернуть image/release `3a94d0009c5996febf400aab9af7281eee9af95c`. DB migration отсутствует; PostgreSQL и documents volumes при rollback не меняются.

## Декларация

Этот submission описывает exact application commit `2a140832b81a363c4589a6b781b12ed4cc67d1ed` и заменяет claims attempt 01 только в части reverse-proxy Origin bug.
