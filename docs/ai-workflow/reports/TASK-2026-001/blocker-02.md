---
report_id: BLOCK-TASK-2026-001-02
task_id: TASK-2026-001
reported_by: Claude по поручению интегратора Alan Bykov
reported_at: 2026-10-13T12:10:00Z (UTC)
application_repository: https://github.com/alanbykov11work-ux/exim.git
app_commit: 64843fd3371488c50f5262f3fddebf362e343a69
status: blocked
scope: только hosted-проверки; source/local работа продолжается
---

# Blocker: нет отдельной тестовой среды

## Что отсутствует

1. Отдельный тестовый проект Supabase (не production), с включённым Storage.
2. Отдельный Vercel Preview, привязанный к ветке `task/TASK-2026-001-integrated`, с переменными окружения этого тестового проекта.

Production Supabase и `exim-super-app.vercel.app` не используются и не переподключаются.

## Кто устраняет

Интегратор / владелец аккаунтов Supabase и Vercel (Alan Bykov). Claude не создаёт платные ресурсы и не получает новые полномочия.

## Требуемые настройки

- Supabase: новый проект, регион любой; Auth email+password; Storage включён. Ключи — только в env Preview и в локальном менеджере секретов, не в Git.
- Vercel: Preview-деплой ветки; `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — от тестового проекта; production env не трогать.
- Семь синтетических аккаунтов: A1 client, A2 client, manager A, logistician A, tenant admin A, B1 client, tenant admin B — пароли вне Git.

## Как подтвердить связь Preview с commit

В Vercel у деплоя виден SHA; он должен совпасть с `app_commit` в submission. Дополнительно — `GET /api/version` отсутствует; подтверждение — по SHA деплоя в Vercel.

## Что выполняется сразу после устранения

Применение миграций по порядку из submission-01 на пустой тестовой базе, репетиция rollback, семь сессий с UI/direct URL/REST/RPC, Storage-вложения, Realtime, E2E на Preview.
