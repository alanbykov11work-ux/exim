---
report_id: SUB-TASK-2026-001-03
task_id: TASK-2026-001
task_revision: 1
submission_attempt: 3
submitted_by: Claude (Opus 5.5) по поручению интегратора Alan Bykov
submitted_at: 2026-10-16 (UTC)
product_os_ref: product-os-task-2026-001-r1 / 0306844716ed0ed69033e264f5398b1e992a2851
app_repository: https://github.com/alanbykov11work-ux/exim.git
app_branch: task/TASK-2026-001-integrated
app_commit: 563b23cae890e417825be8d6676a3744ea0f61cd
pull_request: https://github.com/alanbykov11work-ux/exim/pull/8 (draft)
preview_url: BLOCKED — blocker-02
preview_deployment_id: BLOCKED
status: submitted
---

# Submission report 03 — сквозной сценарий в браузере на реальном backend

> Отчёт исполнителя, не приёмка. Submission-01/02 не изменялись. Код приложения после submission-02 не менялся:
> добавлены только тест `e2e/real/*`, запускатель `scripts/local-stack/real-ui.sh` и отображаемые поля в фикстурах.

## Что проверено

`scripts/local-stack/real-ui.sh` (npm `test:e2e:real`): свежая одноразовая БД PostgreSQL 16 → полный chain миграций →
фикстуры → PostgREST 12 → **настоящий SPA (`public/exim/*`) и настоящий supabase-js 2.45.4** в Chromium. Каждая роль —
отдельный браузерный контекст со своим JWT (клиент A1, клиент A2, менеджер A, логист A). Все действия — нажатия
кнопок и ввод в формы интерфейса; итог сверяется прямыми запросами к REST.

Результат на дереве `563b23c`: **18/18** (два независимых прогона на свежих БД также 18/18):

- клиент заполняет форму запроса и отправляет; двойное нажатие создаёт одну заявку;
- клиент A2 по прямому адресу заявки A1 получает «Не найдено», данных не видно;
- карточки заявки и перевозки восстанавливаются по адресу после Reload;
- менеджер назначает логиста; логист принимает, сохраняет две отдельные ставки (этап не меняется), завершает поиск;
- менеджер выбирает ставку, отправляет предложение v1;
- устаревшая версия: вкладка клиента с v1, во второй вкладке — вопрос по предложению, менеджер отправляет v2 с причиной смены цены; согласование v1 из первой вкладки отклонено; после Reload видна v2, клиент согласует её;
- менеджер фиксирует договорное основание; двойное нажатие «Создать перевозку» — ровно одна перевозка;
- логист проводит перевозку и рейс до «в пути» через формы (комментарии, время, место, источник, транспорт);
- логист добавляет два внутренних события, менеджер публикует оба;
- клиент видит обе публикации и не видит водителя, номер машины, перевозчика и внутренний текст;
- сбой сервера (503 на все REST-запросы) → состояние ошибки с «Повторить»; после восстановления «Повторить» загружает данные;
- необработанных ошибок страницы нет.

## Команды и результаты (exact head `563b23c`)

| Команда | Среда | Результат | Файл |
|---|---|---|---|
| `npm test` | VM интегратора | 52/52 | `evidence-03/npm-test.txt` |
| typecheck / lint / build | VM | PASS / PASS / PASS | `evidence-03/typecheck.txt`, `lint.txt`, `build.txt` |
| `scripts/local-stack/real-ui.sh` | облачная песочница (см. `cloud-runtime.txt`) | 18/18 | `evidence-03/real-ui-result.txt` |
| `scripts/local-stack/reset-and-run.sh` | то же | 85/85 | `evidence-03/rest-gate-result.txt` |
| `npm run test:e2e` (MOCK) | то же | 20/20 | `evidence-03/e2e-mock-result.json` |

Контрольные суммы — `evidence-03/SHA256SUMS`.

## Изменения в AC matrix относительно submission-02

| AC ID | Было | Стало | Основание |
|---|---|---|---|
| AC-TASK-009 | PASS_BY_IMPLEMENTER (MOCK + unit) | PASS_BY_IMPLEMENTER (local real UI) | Reload карточек заявки и перевозки на реальном backend; возврат после входа по-прежнему не прогонялся с GoTrue |
| AC-TASK-010 | PASS_BY_IMPLEMENTER (MOCK) | без изменений + реальный сбой сервера → Retry | real UI |
| AC-TASK-011 | PASS_BY_IMPLEMENTER (local) | PASS_BY_IMPLEMENTER (local real UI) | форма → отправка → одна заявка при двойном нажатии |
| AC-TASK-013…018 | PASS_BY_IMPLEMENTER (local REST) | PASS_BY_IMPLEMENTER (local REST + real UI) | весь путь через кнопки интерфейса |

Остальные строки — как в submission-02. BLOCKED без изменений: AC-001, 002, 022 (hosted Supabase и Preview, blocker-02).

## Ограничения

Это не hosted: экран входа (GoTrue), Storage API (загрузка файлов в интерфейсе не прогонялась), Realtime и Preview не участвуют.
Ширина экрана в этом прогоне — 1280; узкие экраны покрыты MOCK-тестом.

## Декларация

Описывает exact `app_commit` `563b23cae890e417825be8d6676a3744ea0f61cd`. Не означает независимую проверку, приёмку или разрешение production deploy.
