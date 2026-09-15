# Claude Code — обязательный старт

Ты работаешь в каноническом application repository EXIM Super App.

## Сначала прочитай

Полностью прочитай:

1. `README.md`;
2. `AGENTS.md`;
3. `docs/ai-workflow/README.md`;
4. `docs/ai-workflow/current-task.md`;
5. `docs/ai-workflow/product-os.lock.json`;
6. закреплённые документы Product OS, перечисленные в текущей задаче.

## Обязательный preflight

До первого изменения выведи:

- resolved git root;
- exact `origin` URL;
- текущую ветку и exact HEAD;
- clean/dirty status;
- найденные instruction-файлы;
- обнаруженный по manifests/config/code стек;
- штатные команды build/lint/typecheck/test/migrations;
- подтверждённую связь Preview с exact commit;
- доступную безопасную тестовую среду и способ получить тестовые аккаунты без раскрытия секретов.

Ожидаемый origin: `https://github.com/alanbykov11work-ux/exim.git`.

## Жёсткое стартовое условие

Если `docs/ai-workflow/current-task.md` имеет статус `awaiting_application_source`, если в репозитории нет существующего приложения или exact baseline не закреплён — не создавай новый проект и не пиши application code. Создай только следующий номер `blocker-NN.md` в папке текущей задачи и остановись.

Когда статус станет `ready`, все идентификаторы совпадут, дерево будет чистым и безопасная Preview/test-среда будет подтверждена:

1. создай ветку `task/<TASK-ID>-<slug>` от указанного baseline;
2. реализуй только текущий scope;
3. запускай штатные проверки по мере работы;
4. не трогай production;
5. отправь ветку и создай application Pull Request;
6. добавь `submission-NN.md` и `evidence-manifest-NN.md` для exact app commit;
7. не ставь себе `accepted` и не создавай следующую задачу.

## Product OS

Product OS используется строго по pinned commit из lock-файла. Не подменяй tag плавающей веткой `main`. Не меняй Product OS в application PR.

Если доступ позволяет, после application submission создай отдельный additive-only report PR в Product OS по его правилам. Если такой доступ отсутствует, оставь полный отчёт в этом репозитории и укажи ссылку на него в application PR — Codex перенесёт/сверит отчёт отдельно.

## Что считается завершением

Завершение реализации — это не фраза «готово». Нужны одновременно:

- exact application commit и Pull Request;
- Preview того же commit либо честный `BLOCKED`;
- результаты build/lint/typecheck/tests;
- migration apply/rollback и оценка данных, если миграции есть;
- матрица всех acceptance criteria;
- обезличенные доказательства без секретов;
- перечень FAIL, NOT_RUN, MANUAL_REQUIRED и residual risks.
