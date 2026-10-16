---
report_id: SUB-TASK-2026-001-01
task_id: TASK-2026-001
task_revision: 1
submission_attempt: 1
submitted_by: Claude (Opus 5.5) по поручению интегратора Alan Bykov
submitted_at: 2026-10-13T12:10:00Z (UTC)
product_os_ref: product-os-task-2026-001-r1 / 0306844716ed0ed69033e264f5398b1e992a2851
app_repository: https://github.com/alanbykov11work-ux/exim.git
app_branch: task/TASK-2026-001-integrated
app_commit: 64843fd3371488c50f5262f3fddebf362e343a69
pull_request: см. описание PR в этой ветке (URL добавляется после открытия)
preview_url: BLOCKED — нет отдельного test Supabase / Vercel Preview (blocker-02)
preview_deployment_id: BLOCKED
status: submitted
---

# Submission report

> Это отчёт исполнителя, а не независимая проверка и не приёмка. PGlite и браузерный тест
> с подменённым Supabase не доказывают поведение hosted Supabase/PostgREST/Realtime/Storage.

## Результат

Одна интегрированная ветка от `main` `64017a5d…` содержит все незамерженные волны
(Wave 1 → 4b) и исправления по Codex review от 2026-10-08 (Issue #5). Все обязательные
локальные проверки на exact head проходят: `npm test` 49/49, typecheck, lint, build.
Браузерный E2E на exact head: 18/18 с подменённым backend. Hosted-проверки
(семь аккаунтов, применение миграций, Preview того же commit) — `BLOCKED`.

## Baseline и preflight

| Repo | Root | Origin | Base branch | Baseline SHA | Initial status | Instructions read |
|---|---|---|---|---|---|---|
| Application | рабочая копия интегратора | `https://github.com/alanbykov11work-ux/exim.git` | `main` | `64017a5d46ab54eae492fc9b0e2987e214f81782` (= `origin/main` на 2026-10-13) | clean | README, AGENTS, CLAUDE, CONTRIBUTING, docs/ai-workflow/** |
| Product OS | read-only клон | `https://github.com/morgiyt/exim-product-os.git` | — | `0306844716ed0ed69033e264f5398b1e992a2851` | не изменялся | TASK-2026-001, REQ-001…006, Foundation Gate |

Фактический стек по manifests: Next.js 15.5.27, React 18.3.1, TypeScript 5.9.3, Supabase (`@supabase/ssr`, `@supabase/supabase-js`).
Архитектурное отклонение от раздела 4 мастер-ТЗ (остаёмся на Supabase) — решение владельца; письменное ADR-исключение куратора в репозитории **отсутствует**.

## Коммиты сверх baseline (20)

| Commit | Пакет |
|---|---|
| `5d63d8c` | Start Foundation Gate security baseline (Wave 1) |
| `ea049dc` | Enforce tenant membership at app entry (Wave 1) |
| `97faacb` | Wave 1b — scope legacy Private OS objects |
| `1ea0692` | Wave 1c — CRM, tasks, chats scoped to workspace |
| `751a659` | Wave 2 — addressable navigation, server search, mobile layout |
| `06e0389` | Wave 2b — server-backed counters, screen states |
| `a92d886` | Wave 3a — RateQuote, two-rate rule |
| `ee0eb17` | Wave 3b — versioned CommercialOffer |
| `01a164a` | Wave 3c — request revisions |
| `65fce26` | Wave 3d — REQ-001 form, drafts, idempotent submit |
| `ecf5233` | Wave 3e — clarifications, price change reasons |
| `9d93ecd` | Wave 3f — request photos and documents |
| `9a47e3a` | Wave 4a — agreement basis gate, single Shipment |
| `af6bed7` | Wave 4b — mode-aware trips, versioned events, explicit publication |
| `a0cec8b` | Review P1 — load errors surfaced, cache fresh only on success |
| `5d9882f` | Review P2 — typed `#/order`/`#/shipment` addresses, malformed hash invalid |
| `4ba9fc8` | Review P2 — closed vs converted, no invented KPI, inbox rows, working Retry |
| `e625abe` | Review P2 — server mode for shipments screens, demo flows off |
| `c2477d2` | Browser E2E harness |
| `64843fd` | Dependencies: Next 15.5.27, `npm audit fix` без `--force` |

## Исправления по Codex review 2026-10-08

| # | Замечание | Что сделано | Доказательство |
|---|---|---|---|
| P1 | Ошибки загрузки маскируются пустыми данными | `_loadAll()` проверяет `{error}` и `data:null` у **всех** обязательных запросов; частичный набор не публикуется; `loadedAt` ставится только после успеха; Retry идёт на сервер. Экраны показывают error/forbidden с «Повторить» | `test/workflow-load.test.mjs` (8 тестов: 401, 403, 500, null-data, thrown, rejected promise, любой из 5 запросов, retry→success, empty only after success); E2E «server error → error state», «Retry reloads» |
| P2 | Адрес перевозки теряется | Единые адреса `#/order/<uuid>` и `#/shipment/<uuid>`; поиск, список «Входящих» и открытие карточки из списка меняют адрес; Reload восстанавливает карточку только среди объектов, которые сервер вернул пользователю; `shipment-detail` в серверном режиме ведёт на серверную карточку | E2E: search→URL→Reload (заявка и перевозка), Back/Forward, list click→URL, unknown id → «Не найдено» одинаково |
| P2 | Malformed hash бросает исключение | `decodeURIComponent` в try/catch; лишние/пустые сегменты и id у раздела без объекта — invalid | `test/router.test.mjs` (15 адресов, без исключений); E2E на `#/workflow/%`, `#/workflow/a/ignored`, `#/%E0%A4%A` |
| P2 | Отклонённая заявка даёт конверсию 100% | «Закрыто» (converted+rejected+archived) отделено от успешного исхода (`converted`); метрика конверсии и план не утверждены в Product OS — **не вычисляются**, показывается «—» с пояснением | `test/counts.test.mjs`: rejected-only, converted-only, archived, mixed, empty; E2E: счётчик = длина списка, конверсия «—» |
| P2 | Source of truth неоднороден | Новый `server-mode.js`: в авторизованном режиме списки/карточка/tracking перевозок читают серверные перевозки; демо-перевозки из localStorage не загружаются; демо-создание перевозки без заявки, оплата и маржа по демо-данным отключены; «Входящие» показывают строки серверных заявок; пустота — только после успешного ответа | E2E «inbox shows server rows», «shipments list from server only» |
| P2 | (найдено при проверке) Retry не работал вовсе | id функции повтора содержал `-` и в `onclick` разбирался как вычитание | E2E «Retry reloads from server» (до исправления — FAIL) |
| P2 | (найдено при проверке) первый адрес рисовался демо-данными | `counts.js`/`server-mode.js` загружаются до `router.js` | E2E «server error → error state» (до исправления — FAIL) |
| 6 | Dependency audit | См. раздел «Зависимости» | `evidence-01/npm-audit-summary.json` |

Инвентарь экранов, читающих `APP_STATE.shipments` (app.js): статус дашборда, лента дашборда, список перевозок, карточка `shipment-detail`, tracking, маржа, демо-мастер новой перевозки, счёт/оплата, «поделиться». В серверном режиме первые пять получают серверные перевозки или ведут на серверную карточку; маржа, демо-мастер и оплата отключены с пояснением. Карта/маршрутные точки tracking по-прежнему строятся по шаблонным точкам `STATUSES` — это не реальные координаты (gap, GPS вне Gate).

## Зависимости (`npm audit`)

До: 9 записей (8 high, 1 moderate). После: 7 (6 high, 1 moderate). Сделано: `next` и `eslint-config-next` 15.5.24 → 15.5.27 (patch); `npm audit fix` без `--force` (sharp, source-map-js).

| Пакет | Runtime/dev | Применимость | Остаточный риск |
|---|---|---|---|
| `next` (moderate) | runtime | Остаётся только через вложенный `postcss` 8.4.31, который Next закрепляет у себя | Исправление по audit — major `next@16`; не делали |
| `postcss` (high ×4 advisory) | build-time, вложен в next | Advisories касаются обработки CSS/source maps, контролируемых атакующим. Мы обрабатываем только свой CSS в сборке; во время работы сайта postcss не исполняется | Низкий; снимется обновлением Next |
| `eslint-config-next`, `@next/eslint-plugin-next`, `fast-glob`, `micromatch`, `braces` (high) | dev | ReDoS/DoS в glob-матчинге линтера на локальной машине/CI | Низкий; audit предлагает downgrade до 14.x — не делали |

## Миграции и данные

- Migration IDs и порядок применения на **чистой тестовой** базе: `schema.sql`, `workflow.sql`, `chats_tasks.sql`, `badges.sql`, `crm.sql`, `smart_ref.sql`, `rate_limit.sql`, `admin_roles.sql` (baseline) → `foundation_wave_1.sql` → `foundation_wave_1b_legacy_scope.sql` → `foundation_wave_1c_work_scope.sql` → `foundation_wave_2_shell.sql` → `foundation_wave_3a_rate_quotes.sql` → `foundation_wave_3b_offers.sql` → `foundation_wave_3c_revisions.sql` → `foundation_wave_3d_request_form.sql` → `foundation_wave_3e_clarifications.sql` → `foundation_wave_3f_attachments.sql` (нужен Supabase Storage) → `foundation_wave_4a_agreement_shipment.sql` → `foundation_wave_4b_trips_tracking.sql`. Подробности и откат — `docs/ai-workflow/migrations/TASK-2026-001-wave-*.md`.
- Apply: проверен только в PGlite 0.5.8 (каждый тест применяет цепочку на пустой базе с заглушками `auth`/`storage`). На hosted Supabase — `NOT_RUN` (blocker-02).
- Rollback: forward-only; откат кода — `git revert`; для БД в каждом wave-документе перечислены триггеры/политики, которые снимаются, таблицы и колонки не удаляются. Rollback на реальной базе — `NOT_RUN`.
- Backward compatibility: старые клиентские вызовы прямой записи статусов/перевозок/ленты **отклоняются** сервером — фронтенд в этой ветке переведён на функции.
- Existing-data impact: **legacy-строки без workspace скрыты до owner-only backfill** (`legacy_assign_order_scope`, `legacy_assign_work_scope`). Применение к рабочей базе без плана backfill скроет все текущие заявки — запрещено.

## Команды и результаты (exact head `64843fd`)

| Команда/сценарий | Среда | Результат | Evidence ID | Комментарий |
|---|---|---|---|---|
| `npm ci` (с lifecycle scripts) | Linux VM интегратора, Node 22.23.2, npm 10.9.8 | PASS | E-01 | |
| `npm test` | то же | PASS 49/49, 0 skipped | E-02 | node:test; PGlite 0.5.8 для SQL |
| `npx tsc --noEmit` | то же | PASS | E-03 | |
| `npm run lint` | то же | PASS | E-04 | |
| `npm run build` | то же, placeholder public env | PASS (Next.js 15.5.27) | E-05 | Без подключения к реальной базе |
| `npm run test:e2e` | облачная песочница, Chromium (Playwright 1.56), Node 22.22 | PASS 18/18 | E-06 | Подменённый Supabase в `e2e/harness.html`; дерево — `git archive 64843fd` |
| Secret/PII scan (`git grep`: JWT-подобные строки, `service_role`, private keys, e-mail) | VM | PASS: секретов нет; e-mail только плейсхолдеры (`you@company.kz`) и публичный контакт компании | — | Значения не публикуются |
| `npm audit --json` | VM интегратора | 7 записей (6 high, 1 moderate) | E-07 | см. «Зависимости» |
| Hosted Supabase: apply/rollback, 7 аккаунтов, REST/RPC, Storage, Realtime | — | BLOCKED | — | blocker-02 |
| Preview того же commit | — | BLOCKED | — | blocker-02 |

## Acceptance matrix

| AC ID | Claim | Result | Evidence IDs | Кто выполнял | Комментарий |
|---|---|---|---|---|---|
| AC-TASK-001 | Preflight, безопасная non-production среда | BLOCKED | E-01 | Claude | Git/Product OS preflight выполнен; отдельной test-среды нет |
| AC-TASK-002 | Auth для 7 аккаунтов | BLOCKED | E-02 | Claude | Локально: callback без ложного success (тест); вход отдельными аккаунтами не выполнялся |
| AC-TASK-003 | Семь аккаунтов | BLOCKED | — | — | Нет test Supabase |
| AC-TASK-004 | Изоляция A/B и A1/A2 | BLOCKED | E-02 | Claude | PGlite: изоляция на всех таблицах волн 1–4b; UI/REST отдельными аккаунтами не проверены |
| AC-TASK-005 | Payload без cost/margin/carrier/driver | BLOCKED | E-02 | Claude | PGlite: колоночные гранты и проекции; hosted payload не снят |
| AC-TASK-006 | Capabilities инертны, entitlement off | BLOCKED | E-02 | Claude | PGlite PASS; hosted не проверен |
| AC-TASK-007 | Counts = status, audit, reload | FAIL | E-02, E-06 | Claude | Счётчики и список из одного серверного набора (E2E); audit пишется для части критических действий (роль, scope, ставка, основание, Shipment), не для всех |
| AC-TASK-008 | Поиск по ID, non-disclosure | BLOCKED | E-02, E-06 | Claude | PGlite + E2E с подменой PASS; hosted не проверен |
| AC-TASK-009 | Stable URLs, Reload, Back/Forward, return after login | NOT_RUN | E-06 | Claude | E2E с подменой PASS для section/order/shipment; return target после login не проверялся |
| AC-TASK-010 | 360/375/390, состояния, Retry | NOT_RUN | E-06 | Claude | 4 раздела без overflow, error+Retry на «Входящих»; формы/диалоги и остальные разделы не прогонялись |
| AC-TASK-011 | Форма REQ-001 | BLOCKED | E-02 | Claude | PGlite: draft, обязательные поля, идемпотентность, scope; Form E2E не выполнялся |
| AC-TASK-012 | Immutable workflow version | FAIL | — | — | Сущности версии workflow и закрепления инстанса нет; переходы зашиты в SQL |
| AC-TASK-013 | ≥2 RateQuote в `rate_search` | FAIL | E-02 | Claude | Правило двух ставок и отдельное завершение есть, но этап называется `assigned`, а не `rate_search`; несоответствие словарю Gate |
| AC-TASK-014 | Versioned CommercialOffer, ответ на версию | BLOCKED | E-02 | Claude | PGlite PASS; low-margin trigger не включён; hosted не проверен |
| AC-TASK-015 | Shipment после contract basis, ровно один | BLOCKED | E-02 | Claude | PGlite PASS; hosted не проверен |
| AC-TASK-016 | Shipment `preparation → … → in_transit` | FAIL | — | — | Используются старые статусы перевозки (`preparing/loading/in_transit/…`); переходы Gate и проверки actor не реализованы |
| AC-TASK-017 | Trip: идемпотентно, parent/sequence/route/mode/assignee | FAIL | E-02 | Claude | Есть mode, carrier/vehicle/driver, safe layer клиенту; нет sequence/assignee, идемпотентности и workflow до `in_transit` |
| AC-TASK-018 | ≥2 events, публикация, порядок, versioned correction | BLOCKED | E-02 | Claude | PGlite PASS; трёхролевой E2E не выполнялся |
| AC-TASK-019 | Документы: visibility, versions, audit | FAIL | E-02 | Claude | Есть только вложения заявки (scope, owner, тип из Storage); версий, аудита, factory/partner basis нет |
| AC-TASK-020 | Tenant admin в своём workspace | BLOCKED | E-02 | Claude | PGlite PASS (Wave 1); workflow templates read-only — нет шаблонов |
| AC-TASK-021 | CRM/tasks/chats без регрессии, без Exchange | NOT_RUN | E-02 | Claude | PGlite-тесты прав CRM/tasks/chats PASS; UI-регрессия не выполнялась; Exchange/billing/KYC/GPS не добавлялись |
| AC-TASK-022 | PR, Preview того же commit, migrations, AC matrix, evidence | BLOCKED | E-01…E-07 | Claude | Preview и migration apply/rollback — blocker-02 |

## Regression, известные проблемы и residual risks

- Hosted Supabase не проверялся ни разу: PostgREST-вложения, Realtime-подписки, Storage-политики, реальный JWT.
- `orders_scoped()` не возвращает новые поля REQ-001; карточки дочитывают их отдельным SELECT.
- Аналитика `modules.js` читает `WF.getData()` и теперь при ошибке получает исключение — экран аналитики не проверялся на состояние ошибки.
- Внутренние имена этапов не совпадают со словарём Gate (`assigned` вместо `rate_search`, статусы перевозки) — см. AC-012/013/016.
- Антивирус, checksum и версии документов отсутствуют.
- `APP_STATE` в localStorage синхронизируется в облако компонентом `EximApp` (`SYNC_PREFIX`) — демо-данные других разделов (контейнеры) остаются.

## Rollback plan

Код: `git revert` коммитов этой ветки (PR не сливается автоматически). БД: применять только на тестовой базе; откат — снятие триггеров/политик по wave-документам, без удаления данных.

## Декларация

Этот submission описывает exact `app_commit` `64843fd3371488c50f5262f3fddebf362e343a69`. Он не означает независимую проверку, человеческую приёмку или разрешение production deploy.
