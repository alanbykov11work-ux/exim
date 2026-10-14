---
report_id: SUB-TASK-2026-001-02
task_id: TASK-2026-001
task_revision: 1
submission_attempt: 2
submitted_by: Claude (Opus 5.5) по поручению интегратора Alan Bykov
submitted_at: 2026-10-14T12:00:00Z (UTC)
product_os_ref: product-os-task-2026-001-r1 / 0306844716ed0ed69033e264f5398b1e992a2851
app_repository: https://github.com/alanbykov11work-ux/exim.git
app_branch: task/TASK-2026-001-integrated
app_commit: c066519b16cca90c2a71fb200922df7bc928d814
pull_request: https://github.com/alanbykov11work-ux/exim/pull/8 (draft)
preview_url: BLOCKED — blocker-02 (hosted test Supabase + Preview отсутствуют)
preview_deployment_id: BLOCKED
status: submitted
---

# Submission report 02

> Отчёт исполнителя, не независимая проверка и не приёмка. Submission-01 не изменялся.
> Новое в этой сдаче — **локальный non-production стек**: настоящий PostgreSQL 16 + PostgREST 12, семь
> синтетических аккаунтов с локально выпущенными JWT. Это не hosted Supabase: нет GoTrue (вход по паролю),
> Storage API (загрузка эмулируется вставкой в `storage.objects` под JWT пользователя), Realtime.

## Результат

PR #8 — единая точка проверки. Ветки 4c (`7fd17bc`) и 5a (`2bea45e`) были прямыми потомками integrated и
включены fast-forward без переписывания истории; сверху — исправление безопасности, Wave 5b и проверки.

- `npm test` 52/52, typecheck, lint, build — PASS на exact head.
- REST/RPC сценарий Gate на локальном стеке — **85/85** (семь аккаунтов, два tenant, три компании).
- Полная цепочка миграций на настоящем PostgreSQL 16 через runner с журналом SHA-256 — PASS; повторный запуск пропускает применённые, изменённый файл останавливает запуск.
- Репетиция отката через резервную копию — PASS для 4c→5a и 5a→5b.
- MOCK браузерный E2E — 20/20 (подменённый backend).

## Найдено и исправлено: обход проверки роли не работал бы на hosted Supabase

Команды БД временно очищали `request.jwt.claim.sub`, чтобы их внутренняя запись прошла role guard
заказа. В hosted Supabase `auth.uid()` при пустом `claim.sub` берёт `sub` из `request.jwt.claims`, поэтому
очистка ничего не меняла: отправка запроса клиентом, назначение логиста, ответ на предложение и другие
команды падали бы на hosted. PGlite-тесты определяли `auth.uid()` иначе и это скрывали.
Исправление (`95fae9c`): транзакционный флаг `exim.trusted`, который учитывает `orders_scope_guard`;
флаг недоступен через API. Тестовые харнессы теперь используют hosted-определение `auth.uid()`.
Локальный стек на PostgREST воспроизвёл исходную ошибку и подтвердил исправление.

## Коммиты сверх submission-01 (`e9a5622` → `c066519`)

| Commit | Что |
|---|---|
| `7fd17bc` | Wave 4c — этапы Shipment и Trip |
| `2bea45e` | Wave 5a — версионируемый workflow REQ-003 |
| `95fae9c` | fix(security): флаг `exim.trusted` вместо очистки `claim.sub` |
| `0b9acec` | Локальный стек, runner миграций с журналом, REST-сценарий, репетиция отката |
| `ce5aae4` | Wave 5b — аудит критических записей, документы Gate, партнёрское основание |
| `7460659` | UI документов перевозки и партнёрского основания |
| `52889c1` | AC-009: return target после входа |
| `c066519` | Тесты: документы/аудит в REST, диалоги и регрессия в MOCK E2E |

## Изменения API после 5a (сверка сигнатур и UI)

| RPC | Было | Стало | UI |
|---|---|---|---|
| `assign_logist` | прямой UPDATE `orders` | новая функция | `WF.assign` |
| `logist_accept`, `logist_request_data`, `complete_rate_search`, `close_without_rate` | — | новые | кнопки логиста/менеджера |
| `send_offer` | из `calculated/offer_sent/rejected` | из `offer_preparation`/`clarification_requested`, нужна выбранная ставка | без изменений вызова |
| `decide_offer` | 2 аргумента | + `p_reason` (отказ — с причиной); 2-аргументная версия сохранена | причина из поля под предложением |
| `record_agreement` | номер необязателен | номер/ссылка обязательны | поле помечено * |
| `advance_shipment` | 3 аргумента | + `p_occurred_at`, `p_location` | поля даты/места |
| `create_trip` | перевозчик/машина при создании | только mode/откуда/куда; транспорт — `assign_trip_transport` | двухшаговая форма |
| `advance_trip` | 2 аргумента | + время, место, источник | форма шага |
| Прямые UPDATE статуса заявки | разрешены guard'ами | закрыты (`orders_wf_guard`) | все вызовы переведены на функции |

Связь согласованного offer, выбранной ставки и основания с версией заявки: ставки хранят `order_revision`; после выхода из `manager_review`/`data_required` заявку менять нельзя (recalculation — TBD), поэтому предложение, ставка и основание всегда относятся к последней ревизии. Данные, созданные до 5a, продолжают работу: instance создаётся при первом переходе с этапом из старого статуса — проверено в репетиции отката (`->manager_review,manager_review>sent_to_logistician`).

## Миграции и данные

- Порядок: `scripts/local-stack/apply.sh` (единый список; 5b добавлена последней).
- Apply: полный chain на PostgreSQL 16.15 — PASS (`evidence-02/migration-apply.txt`). Hosted — BLOCKED.
- Rollback: восстановление из резервной копии, снятой перед новой миграцией, в новую БД; строки и журнал совпадают с состоянием до миграции (`rollback-rehearsal-*.txt`). Снятие триггеров откатом не считается.
- Existing data: legacy-строки без workspace по-прежнему скрыты до owner-only backfill — к рабочей базе не применять.
- Ограничение: файлы Wave 1–1c содержат собственные BEGIN/COMMIT, поэтому `-1` для них не даёт атомарности — runner фиксирует факт применения после файла.

## Команды и результаты (exact head `c066519`)

| Команда/сценарий | Среда | Результат | Evidence ID |
|---|---|---|---|
| `npm ci` | VM интегратора, Node 22.23.2 | PASS | E2-01 |
| `npm test` | то же | 52/52, 0 skipped | E2-02 |
| typecheck / lint / build | то же | PASS / PASS / PASS (Next 15.5.27) | E2-03…05 |
| `scripts/local-stack/reset-and-run.sh` (apply + fixtures + REST) | облачная песочница: PostgreSQL 16.15, PostgREST 12.2.3, Node 22 | apply PASS; REST 85/85 | E2-06, E2-07 |
| `scripts/local-stack/rollback-rehearsal.sh` ×2 | то же | PASS / PASS | E2-08 |
| `npm run test:e2e` | Chromium, Playwright 1.56, **MOCK** backend | 20/20 | E2-09 |
| `npm audit` | VM | 7 (6 high dev/build, 1 moderate) — без изменений с submission-01 | E2-10 |
| Hosted Supabase (GoTrue, Storage API, Realtime), Preview exact SHA | — | BLOCKED | blocker-02 |

## Acceptance matrix

`PASS_BY_IMPLEMENTER (local)` = локальный PostgreSQL+PostgREST; `(MOCK)` = браузер с подменённым backend; `(PGlite)` = встроенная БД в тестах.

| AC ID | Result | Evidence | Комментарий |
|---|---|---|---|
| AC-TASK-001 | BLOCKED | E2-01, E2-06 | Git/Product OS preflight выполнен; hosted non-production среды нет; локальный стек — замена только для БД/REST |
| AC-TASK-002 | BLOCKED | E2-02 | Вход/logout/recovery требуют GoTrue; JWT-идентичности семи аккаунтов на REST работают |
| AC-TASK-003 | PASS_BY_IMPLEMENTER (local) | E2-07 | Семь аккаунтов, memberships, scopes; UI-входа отдельными аккаунтами нет |
| AC-TASK-004 | PASS_BY_IMPLEMENTER (local) | E2-07 | Прямой id, поиск, REST/RPC для A2, B1, admin B; UI отдельными аккаунтами — NOT_RUN |
| AC-TASK-005 | PASS_BY_IMPLEMENTER (local) | E2-07 | Цена скрыта от логиста, ставки/водитель/перевозчик/история — от клиента, неверный actor отклонён |
| AC-TASK-006 | PASS_BY_IMPLEMENTER (PGlite) | E2-02 | Entitlement off блокирует переход и сохраняет данные; на REST не прогонялось |
| AC-TASK-007 | PASS_BY_IMPLEMENTER (local + MOCK) | E2-07, E2-09 | Аудит: workflow, ставки, предложения, трекинг, документы, основания; счётчик = список (MOCK) |
| AC-TASK-008 | PASS_BY_IMPLEMENTER (local + MOCK) | E2-07, E2-09 | Номер перевозки не находится чужими аккаунтами; «Не найдено» одинаково |
| AC-TASK-009 | PASS_BY_IMPLEMENTER (MOCK + unit) | E2-02, E2-09 | Адреса, Reload, Back/Forward; return target — только `/app` и адрес формы роутера; реальный вход не прогонялся |
| AC-TASK-010 | PASS_BY_IMPLEMENTER (MOCK) | E2-09 | 4 раздела и 6 диалогов на 360/375/390, ошибка + Retry |
| AC-TASK-011 | PASS_BY_IMPLEMENTER (local) | E2-07 | Идемпотентная отправка, scope; заполнение формы в браузере с реальным backend — NOT_RUN |
| AC-TASK-012 | PASS_BY_IMPLEMENTER (PGlite + local) | E2-02, E2-07 | Закреплённые версии, неизменяемость, отключённые переходы, история с membership, клиентские метки |
| AC-TASK-013 | PASS_BY_IMPLEMENTER (local) | E2-07 | Первая ставка не меняет этап; завершение только при двух валидных |
| AC-TASK-014 | PASS_BY_IMPLEMENTER (local) | E2-07 | Выбор ставки, версия предложения, решение по точной версии; low-margin не включён |
| AC-TASK-015 | PASS_BY_IMPLEMENTER (local) | E2-07 | Основание раньше Shipment; повтор не создаёт дубль |
| AC-TASK-016 | PASS_BY_IMPLEMENTER (local) | E2-07 | Только назначенный логист; Post-Gate отклонён |
| AC-TASK-017 | PASS_BY_IMPLEMENTER (local) | E2-07 | Идемпотентный Trip, sequence, транспорт по виду, безопасный слой клиенту |
| AC-TASK-018 | PASS_BY_IMPLEMENTER (local) | E2-07 | Два события, публикация менеджером, порядок, нет внутренних полей |
| AC-TASK-019 | PASS_BY_IMPLEMENTER (local) | E2-07 | Документы внутренние по умолчанию, версии, публикация с причиной, прямой путь закрыт, партнёрское основание после клиентского. Hosted Storage API, checksum и антивирус — NOT_RUN/gap |
| AC-TASK-020 | PASS_BY_IMPLEMENTER (PGlite + local) | E2-02, E2-07 | Свой аудит виден, чужой — нет; шаблоны только чтение |
| AC-TASK-021 | PASS_BY_IMPLEMENTER (MOCK + PGlite) | E2-02, E2-09 | Экраны CRM/tasks/chats/profile открываются; права — PGlite; Exchange/billing/KYC/GPS не добавлялись |
| AC-TASK-022 | BLOCKED | все | Preview того же commit и hosted apply/rollback — blocker-02 |

## Gap list после 5b

1. Hosted Supabase: GoTrue-вход семью аккаунтами, Storage API (signed URL), Realtime, Preview exact SHA — blocker-02.
2. Сквозной сценарий в браузере на реальном backend (UI-кнопки → RPC → Reload) — после blocker-02; сейчас покрыт REST-сценарием и MOCK E2E раздельно.
3. Документы: checksum содержимого и антивирус/карантин требуют серверной обработки — не реализованы.
4. `npm audit`: 6 high в dev/build-цепочке (eslint, postcss внутри next) — без изменений.

## Rollback plan

Код — `git revert`. БД — восстановление из резервной копии, снятой перед применением, по `scripts/local-stack/rollback-rehearsal.sh`.

## Декларация

Описывает exact `app_commit` `c066519b16cca90c2a71fb200922df7bc928d814`. Не означает независимую проверку, приёмку или разрешение production deploy.
