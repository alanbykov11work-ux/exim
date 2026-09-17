# EXIM Super App

Канонический репозиторий приложения EXIM Super App. Здесь находятся Next.js-код, PostgreSQL-миграции, тесты и изолированная серверная конфигурация.

## Текущее состояние

- приложение импортировано и развивается из реального исходного кода;
- runtime: Next.js 15 + React 18 + TypeScript;
- Supabase удалён из исполняемого приложения;
- авторизация, сессии, профиль, рабочее пространство, пользовательское состояние и приватные документы работают через серверные API и отдельный PostgreSQL 16;
- старые SQL-файлы `supabase/**` временно сохранены только как историческое свидетельство;
- чтение старого раздела заявок подключено к tenant-scoped серверному snapshot;
- запись заявок, CRM, чатов и задач переносится на отдельные доменные API и пока не считается готовой;
- серверный контур — отдельный preview/staging без реальных клиентских данных.

## Границы продукта

- EXIM Super App — отдельный Private OS для работы клиента, менеджера и логиста.
- EXIM Hub — отдельный продукт и входная точка. У него нет общей базы или общих cookies с Super App.
- Первая связь Hub → Super App остаётся link-first. API/SSO/события требуют отдельного решения.
- EXIM Daily остаётся отдельным сервисом.

## Где искать правду

- [`AGENTS.md`](AGENTS.md) — правила для AI-агентов;
- [`CLAUDE.md`](CLAUDE.md) — вход для Claude Code;
- [`docs/ai-workflow/current-task.md`](docs/ai-workflow/current-task.md) — активная задача;
- [`docs/application-readme.md`](docs/application-readme.md) — локальный запуск и состояние backend;
- [`docs/self-hosting.md`](docs/self-hosting.md) — сервер, PostgreSQL, backup/export/restore;
- [Product OS](https://github.com/morgiyt/exim-product-os) — продуктовые требования и решения.

## Быстрая локальная проверка

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

Полный запуск требует PostgreSQL и переменные из `.env.example`. Секреты, `.env`, реальные данные и резервные копии в Git не добавляются.
