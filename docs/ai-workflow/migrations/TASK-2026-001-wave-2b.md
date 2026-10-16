# TASK-2026-001 — Wave 2b: единые счётчики и состояния экранов

- `public/exim/counts.js`: счётчики входящих и статус дашборда считаются из серверных заявок/перевозок (`WF.getData` → `orders_scoped`), теми же статусными группами для всех экранов. Локальные демо-данные `APP_STATE.requests/shipments` при наличии сессии Supabase больше не используются для чисел.
- Единые состояния: loading / empty / error с «Повторить» / forbidden (`42501`, 401, 403) / notfound.
- SQL не менялся. Тесты: `test/counts.test.mjs` (3).
- Проверки: `npm test` 33/33, tsc, lint, build — PASS. Проверка на Preview — BLOCKED (нет staging).
- Откат: `git revert` коммита.
