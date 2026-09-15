# Правила для AI-агентов

Область действия: весь репозиторий.

## Назначение репозитория

Это application repository EXIM Super App. Код приложения, миграции, тесты и техническая документация приложения живут здесь. Продуктовые требования и решения живут отдельно в `https://github.com/morgiyt/exim-product-os.git`.

## Приоритет источников

1. Применимые инструкции в этом репозитории: `AGENTS.md`, `CLAUDE.md` и более вложенные `AGENTS.md`.
2. Фактический код, manifests, migrations, tests и deployment-конфигурация этого репозитория — источник технической истины о реализованном состоянии.
3. Закреплённый Product OS commit из `docs/ai-workflow/product-os.lock.json` — источник продуктовой истины.
4. `docs/ai-workflow/current-task.md` — единственный разрешённый текущий пакет работ.
5. При конфликте, неизвестном значении или TBD не придумывать решение: остановить затронутую часть и зафиксировать blocker.

## Перед любой записью

- подтвердить git root, `origin`, текущую ветку, exact HEAD и чистоту дерева;
- прочитать `README.md`, этот файл, `CLAUDE.md`, `docs/ai-workflow/README.md`, `docs/ai-workflow/current-task.md` и lock Product OS;
- получить и прочитать закреплённый Product OS ref;
- определить стек только по исходному коду и manifests приложения;
- определить штатные build/lint/typecheck/test/migration команды;
- убедиться, что задача имеет статус `ready`, а не `awaiting_application_source`, `blocked` или `accepted`;
- создать task-ветку от указанного baseline; не работать напрямую в `main`.

## Запрещено

- создавать новый scaffold, если существующий код приложения отсутствует;
- копировать вместо Super App код из `exim-hub`, EximDaily, Product OS или публичной production-сборки;
- менять Product OS из application Pull Request;
- додумывать бизнес-правила, скрывать FAIL/NOT_RUN/BLOCKED или выдавать собственную работу за независимую проверку;
- выполнять production deploy, менять production secrets/data или ослаблять авторизацию;
- выполнять force push, переписывать опубликованную историю, удалять чужие ветки или сбрасывать чужие изменения;
- коммитить секреты, `.env`, credentials, cookies, unrestricted links или реальные персональные данные.

## Ветки и Pull Request

- одна задача — одна ветка `task/<TASK-ID>-<slug>`;
- base branch и baseline SHA берутся только из `docs/ai-workflow/current-task.md`;
- Pull Request обязан содержать task ID, список изменений, миграции, проверки, известные риски и rollback;
- код и отчёт должны ссылаться на exact commit;
- merge выполняет человек с правами после review; исполнитель не объявляет собственную работу принятой.

## Отчётность

Исполнитель добавляет только новые файлы в `docs/ai-workflow/reports/<TASK-ID>/`:

- `submission-NN.md` — отчёт о конкретном application commit;
- `evidence-manifest-NN.md` — карта доказательств;
- `blocker-NN.md` — честная остановка до небезопасной записи;
- `addendum-NN.md` — дополнение без переписывания старого отчёта.

Существующие отчёты append-only: не изменять, не удалять и не переименовывать. Исполнитель не создаёт `review-*` и `acceptance-*`; их добавляет независимый reviewer или владелец.
