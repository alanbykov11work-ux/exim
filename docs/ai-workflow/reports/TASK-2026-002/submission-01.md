---
report_id: SUB-TASK-2026-002-01
task_id: TASK-2026-002
task_revision: 1
submission_attempt: 1
submitted_by: Codex implementation agent
submitted_at: 2026-09-17T12:06:10+05:00
product_os_ref: product-os-task-2026-001-r1 / 0306844716ed0ed69033e264f5398b1e992a2851
app_repository: https://github.com/alanbykov11work-ux/exim.git
app_branch: task/TASK-2026-002-self-hosted-postgres
app_commit: 3a94d0009c5996febf400aab9af7281eee9af95c
pull_request: https://github.com/alanbykov11work-ux/exim/pull/6
preview_url: https://superapp.185-129-49-242.sslip.io/app
preview_deployment_id: exim-superapp:3a94d0009c5996febf400aab9af7281eee9af95c / sha256:eba2b5f10b4a7acbfb23aa9089109f02f8a2e6c8096e201db18be7172d5642cc
status: submitted
---

# Submission report

> Это отчёт исполнителя, а не независимая проверка и не приёмка.

## Результат

Собран и развёрнут отдельный EXIM Super App Technical Preview на managed server. Исполняемое приложение больше не зависит от Supabase: авторизация, сессии, tenant/workspace foundation, state, profile, документы и read-only workflow snapshot работают через server-side API и отдельный PostgreSQL 16.

Preview доступен по <https://superapp.185-129-49-242.sslip.io/app>. EXIM Hub, EXIM Daily и Super App остаются разными Compose-проектами с разными БД, volumes и секретами. Связь Hub → Super App остаётся только link-first.

## Baseline и preflight

| Repo | Root | Origin | Base branch | Baseline SHA | Initial status | Instructions read |
|---|---|---|---|---|---|---|
| EXIM Super App | `C:\Projects\exim-super-app-codex` | `https://github.com/alanbykov11work-ux/exim.git` | `main` | `ea049dca75e3a2e0f1e936156ab8c7fc80091e7a` | clean | `README.md`, `AGENTS.md`, `CLAUDE.md`, workflow/current-task/task/templates, pinned Product OS |
| EXIM Hub | `C:\Projects\exim-hub` | `https://github.com/morgiyt/exim-hub.git` | `production/lead-qualification-v2` | `2c098255…` | clean | Hub AGENTS, project state, roadmap, integration and staging instructions |

## Что изменено

- Supabase runtime заменён на server-only PostgreSQL, password auth, hashed sessions, rate limits и same-origin guards.
- Добавлены organization/workspace/client-company memberships и tenant-scoped business tables.
- State, profile и private documents переведены на server API; legacy browser bridge разрешает только поддержанное чтение и блокирует неподдержанные записи.
- Добавлены отдельный Compose project, restricted DB role, migration runner с checksum, daily backup, export и guarded restore.
- Super App подключён к Caddy только через `exim-managed-edge`; PostgreSQL остаётся только в private backend network без опубликованного host-port.
- В EXIM Hub отдельным `CR-2026-09-17-007` добавлены HTTPS route и link-first URL без общей БД, cookies или скрытой синхронизации.

## Что намеренно не изменено

- Не выполнялся public production cutover и не переносились реальные клиентские данные.
- Не создавались общая база, общая авторизация, SSO, API/event integration с Hub.
- Полные write-flow CRM, чатов, задач и старого workflow не объявлены готовыми; неподдержанные legacy writes fail closed.
- SMTP verification/password reset, Exchange/ATI.SU и billing не входят в TASK-2026-002.
- Исторические `supabase/**` сохранены как reference и не используются runtime.

## Миграции и данные

- Migration IDs: `db/migrations/0001_self_hosted_core.sql`.
- Apply: PASS на PostgreSQL 16; повторный запуск мигратора PASS без повторного применения изменённой миграции.
- Rollback: application release переключается отдельно; DB migration forward-only. Перед DB rollback обязателен fresh dump и restore совместимой версии.
- Backward compatibility: исторический Vercel origin и предыдущие server releases сохранены как rollback; реальные данные не импортировались.
- Existing-data impact: только синтетические tenants/accounts/documents, созданные smoke-тестами.

## Команды и результаты

| Команда/сценарий | Среда | Результат | Evidence ID | Комментарий |
|---|---|---|---|---|
| `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` | local exact app commit | PASS; tests `12/12` | EVID-002-03 | Runtime npm audit: `0` |
| migration apply + idempotent rerun | managed PostgreSQL 16 | PASS | EVID-002-03 | checksum registry запрещает изменение уже применённой миграции |
| public server smoke | managed preview HTTPS | PASS | EVID-002-04 | registration, session, state, documents, tenant denial, workflow read, callback, logout |
| Hub exact-SHA CI | GitHub Actions run `35191052833` | PASS, six lanes | EVID-002-06 | secret scan и containers включены |
| Hub remote Chromium | Technical Staging | PASS `20/20` | EVID-002-06 | после edge/link migration |
| PostgreSQL operations/Bitrix smoke | Technical Staging | PASS | EVID-002-06 | Hub regression check после deployment |
| backup/checksum/export/restore | managed server, isolated restore DB | PASS | EVID-002-05 | custom-format dump, SHA-256 OK, `29` restored tables |
| documents archive/checksum | managed server export directory | PASS | EVID-002-05 | separate private volume, `3` synthetic archive entries |
| HTTP/HTTPS/security boundary | public preview | PASS | EVID-002-04 | HTTP `308`, unauthenticated `/app` → `/login`, health `200`, declared 13 MiB request `413` |

## Acceptance matrix

| AC ID | Claim | Result | Evidence IDs | Кто выполнял | Комментарий |
|---|---|---|---|---|---|
| AC-002-01 | Отдельные процессы/БД/volumes/secrets, DB без host-port | PASS_BY_IMPLEMENTER | EVID-002-01, EVID-002-02 | Codex | DB показывает только container port `5432/tcp`, без host binding |
| AC-002-02 | Только выделенная edge-сеть Caddy | PASS_BY_IMPLEMENTER | EVID-002-02, EVID-002-06 | Codex | web в own backend + `exim-managed-edge`; DB только own backend |
| AC-002-03 | Runtime без Supabase | PASS_BY_IMPLEMENTER | EVID-002-01, EVID-002-03 | Codex | исторические SQL/reference файлы не являются runtime |
| AC-002-04 | Атомарная регистрация foundation graph | PASS_BY_IMPLEMENTER | EVID-002-03, EVID-002-04 | Codex | bug audit UUID исправлен до финального smoke |
| AC-002-05 | Login/session/logout/membership/rate limit | PASS_BY_IMPLEMENTER | EVID-002-03, EVID-002-04 | Codex | public HTTPS smoke PASS |
| AC-002-06 | State/profile/documents через server API | PASS_BY_IMPLEMENTER | EVID-002-03, EVID-002-04 | Codex | DATABASE_URL не является client env |
| AC-002-07 | Cross-tenant/client denial | PASS_BY_IMPLEMENTER | EVID-002-03, EVID-002-04 | Codex | separate tenants; direct server request denied |
| AC-002-08 | PostgreSQL 16 apply + safe rerun | PASS_BY_IMPLEMENTER | EVID-002-03 | Codex | migration registry + SHA-256 |
| AC-002-09 | `pg_dump -Fc`, checksum, isolated restore | PASS_BY_IMPLEMENTER | EVID-002-05 | Codex | fresh dump restored to `29` tables and test DB removed |
| AC-002-10 | Hub/Daily before-after health and isolation | PASS_BY_IMPLEMENTER | EVID-002-06 | Codex | Hub/Caddy intentionally redeployed under separate CR; Hub/Daily data volumes were not merged or replaced |
| AC-002-11 | Unsupported writes fail closed; no false production-ready claim | PASS_BY_IMPLEMENTER | EVID-002-07 | Codex | limitations are visible in README and registration copy |
| AC-002-12 | Exact release/URL/tests/limits/rollback reported | PASS_BY_IMPLEMENTER | EVID-002-01, EVID-002-08 | Codex | exact code/image/release path listed |

## Regression, известные проблемы и residual risks

- Это Technical Preview/foundation, а не готовый публичный MVP и не production-ready release.
- Полные write-flow заявок, CRM, чатов, задач и перевозок ещё требуют доменных API и E2E.
- Email confirmation в preview активируется сразу; SMTP и рабочий password reset отсутствуют.
- Hub integration пока только link-first. SSO, shared identity, API и events требуют отдельной task/decision.
- PostgreSQL backup и documents archive сейчас находятся на том же server; независимая off-machine encrypted copy ещё не настроена.
- Security headers дублируются в Caddy и Next.js. Значения совместимы, но конфигурацию стоит нормализовать отдельной малой задачей.
- Независимый code review и human/business acceptance не выполнены.

## Rollback plan

1. Вернуть Hub release `efb3111b26188122ed0ca71221069f63ad7d8664` либо reverse migration `0008` и удалить только Super App Caddy route.
2. Переключить Super App symlink/image на предыдущий known-good release.
3. Не удалять Compose volumes. При DB rollback сначала сохранить новый dump, затем восстановить выбранный проверенный dump и совместимый app commit.
4. Исторический Vercel origin остаётся доступным как отдельный rollback, но не получает данные self-hosted preview автоматически.

## Декларация

Этот submission описывает exact `app_commit` `3a94d0009c5996febf400aab9af7281eee9af95c`. Он не означает независимую проверку, человеческую приёмку или разрешение production deploy.
