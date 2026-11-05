# TASK-2026-001 — Wave 3c: версии заявки (revisions)

Миграция: `supabase/foundation_wave_3c_revisions.sql` (после 3b).

- `order_revisions`: полная копия полей заявки (маршрут, транспорт, груз, вес, тип, комментарий) на каждую версию, причина, автор. Версия 1 пишется при создании заявки.
- Поля заявки с workspace меняются только через `revise_order(order, data, reason)`: клиент своей компании — в статусах new/assigned/calculated; менеджер — также после отказа. Логист и прямой UPDATE — запрещено (раньше логист мог менять маршрут и груз).
- Новая версия отзывает действующие ставки и возвращает заявку на расчёт (`assigned`, либо `new` без логиста). У ставок теперь есть `order_revision`.
- UI: кнопка «Изменить заявку» и история версий.
- Тест: `test/foundation-wave-3c-db.test.mjs`. Preview — BLOCKED (нет staging).
- Откат: `git revert`; в БД — `drop trigger orders_request_guard on public.orders` и `drop trigger order_revisions_on_insert on public.orders`. Таблицу не удалять.
- Не сделано: форма REQ-001 (полный набор полей по видам перевозки) — следующий пакет.
