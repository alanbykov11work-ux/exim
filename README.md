# EXIM Super App

Это канонический репозиторий исходного кода EXIM Super App.

## Текущее состояние

Исходный код приложения импортирован в `main` (Next.js 15 + React 18 + TypeScript + Supabase; SPA в `public/exim/`). Активная задача — `TASK-2026-001` Foundation Gate, статус `in_progress`; работа идёт в ветке `task/TASK-2026-001-integrated` (draft PR #8). Актуальное состояние, последняя сдача и что заблокировано — в [`docs/ai-workflow/current-task.md`](docs/ai-workflow/current-task.md). Как установить, проверить и применить миграции — [`ЗАПУСК.md`](ЗАПУСК.md).

Claude не создаёт новый проект, не выбирает новый стек и не восстанавливает приложение по публичному сайту.

## Два репозитория — две роли

- Этот репозиторий — единственное место для кода приложения, миграций и application-тестов.
- [morgiyt/exim-product-os](https://github.com/morgiyt/exim-product-os) — источник продуктовых требований, решений, экранов, статусов и acceptance criteria.
- Закреплённая версия Product OS и активная задача указаны в [`docs/ai-workflow/product-os.lock.json`](docs/ai-workflow/product-os.lock.json).
- Текущий разрешённый этап указан в [`docs/ai-workflow/current-task.md`](docs/ai-workflow/current-task.md). Как установить, проверить и применить миграции — [`ЗАПУСК.md`](ЗАПУСК.md).

## Быстрый старт

1. Человек читает [`CONTRIBUTING.md`](CONTRIBUTING.md).
2. Claude Code начинает с [`CLAUDE.md`](CLAUDE.md).
3. Codex и другие AI-агенты начинают с [`AGENTS.md`](AGENTS.md).
4. Любая реализация выполняется в отдельной ветке и передаётся через Pull Request.
5. Исполнитель прикладывает проверяемый отчёт; независимый reviewer отдельно проверяет результат.

## Неприкосновенные ограничения

- не коммитить пароли, токены, cookies, ключи, `.env` и реальные персональные данные;
- не менять стек, авторизацию, базу данных или deployment-модель без отдельного решения;
- не выполнять production deployment из задачи разработки;
- не смешивать EXIM Super App с другими проектами EXIM;
- не считать build, скриншот или фразу «готово» полноценной приёмкой.
