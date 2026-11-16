# TASK-2026-001 — Wave 3b: версионное коммерческое предложение

Миграция: `supabase/foundation_wave_3b_offers.sql` (после 1c и 3a).

- Таблица `commercial_offers`: версия, цена > 0, валюта, комментарий, срок действия, статус `sent | superseded | approved | rejected`, кто и когда решил. Открытой может быть только одна версия на заявку.
- `send_offer(order, total, currency, comment, valid_until)` — только менеджер/tenant_admin; новая версия делает прежнюю `superseded`. Повторная отправка возможна из `calculated`, `offer_sent`, `rejected`.
- `decide_offer(offer_id, decision)` — только клиент компании заявки и только по открытой версии; решение по устаревшей версии отклоняется.
- `decide_order` оставлена для совместимости и решает только текущую открытую версию.
- Вход в `offer_sent` и выход из него в обход функций закрыт триггером (для заявок с workspace).
- Клиенты видят предложения своей компании; прямые записи в таблицу запрещены.
- UI: менеджер отправляет через `send_offer`; клиент видит номер версии и решает по id версии.
- Тест: `test/foundation-wave-3b-db.test.mjs`. Preview — BLOCKED (нет staging).
- Откат: `git revert`; в БД — `drop trigger orders_offer_flow_guard on public.orders` и вернуть `decide_order` из 1c. Таблицу не удалять.
