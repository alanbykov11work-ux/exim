# EXIM Super App — приложение и backend

## Текущая release-волна

TASK-2026-003 вводит явный server-authorized access context. Сессия хранит одну точную membership; пользователь с несколькими активными memberships выбирает workspace и роль на `/select-context`. Сервер не получает повышенные права из визуального переключателя. Приватные API дополнительно требуют entitlement `private_os` и возвращают безопасные для роли payloads.

## Стек

- Next.js 15 / React 18 / TypeScript;
- PostgreSQL 16;
- серверные route handlers для auth, профиля, состояния, документов и tenant-scoped чтения workflow;
- opaque sessions: случайный токен хранится только в защищённой cookie, в базе хранится HMAC/SHA-256 digest;
- пароли: Node.js `scrypt` с уникальной солью;
- приватные документы: отдельный файловый volume, метаданные и SHA-256 в PostgreSQL.

Браузер не знает пароль базы и не подключается к PostgreSQL напрямую.

## Локальный запуск

1. Поднять PostgreSQL 16.
2. Создать owner и ограниченного пользователя приложения.
3. Выполнить все `db/migrations/*.sql` по порядку через `scripts/server/migrate.sh` owner-подключением.
4. Скопировать `.env.example` в локальный `.env.local` и заменить значения.
5. Запустить:

```bash
npm ci
npm run dev
```

Для серверного контура использовать только [`self-hosting.md`](self-hosting.md) и `docker-compose.server.yml`.

## Что уже перенесено с Supabase

- регистрация и вход;
- rate limiting входа и регистрации;
- server-side session и logout;
- организация, workspace, client company и membership при саморегистрации;
- профиль и пользовательское состояние;
- приватная загрузка, чтение и удаление документов;
- отдельная PostgreSQL-схема всех текущих бизнес-таблиц;
- tenant-scoped read snapshot заявок и перевозок;
- health/readiness endpoints;
- ежедневные `pg_dump -Fc`, checksum, retention и guarded restore.

## Что ещё не считается готовым

- SMTP-подтверждение почты и реальный password reset;
- write API заявок/ставок/предложений/перевозок;
- CRM write API;
- chats/tasks write API и realtime;
- админское управление membership;
- полная RLS defense-in-depth на обычном PostgreSQL;
- перенос любых данных из внешнего Supabase — выгрузка не предоставлена и не выполнялась.

Пока эти пункты не закрыты, серверный origin является preview/staging. Старый интерфейс сохранён, но неподключённые операции возвращают явную ошибку, а не делают вид, что данные записаны.

## Экспорт и перенос базы

База полностью переносима:

```bash
pg_dump --format=custom --no-owner --no-acl
pg_restore --clean --if-exists --no-owner
```

Практические команды, volume и restore drill описаны в [`self-hosting.md`](self-hosting.md). Документы экспортируются отдельно от базы и должны иметь тот же backup identifier.
