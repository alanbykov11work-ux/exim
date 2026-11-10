# TASK-2026-001 — Wave 3a: ставки перевозчиков (RateQuote)

Миграция: `supabase/foundation_wave_3a_rate_quotes.sql` (после 1b; применять на тестовом Supabase).

- Таблица `rate_quotes`: перевозчик, сумма > 0, валюта ISO-3, срок действия, комментарий, автор; `workspace_id` берётся из заявки.
- Видят и добавляют только менеджер / tenant_admin заказа и назначенный логист. Клиент и чужой workspace — 0 строк.
- Ставку нельзя изменить или удалить, только отозвать (`active → withdrawn`, автор или менеджер). Добавление закрыто после статуса `calculated`.
- Правило: заявка с workspace переходит в `calculated` только при ≥2 активных ставках (триггер, код 23514).
- UI: блок ставок в форме расчёта логиста и в карточке менеджера.
- Тест: `test/foundation-wave-3a-db.test.mjs`. Preview — BLOCKED (нет staging).
- Откат: `git revert`; в БД — `drop trigger orders_min_rates_guard on public.orders` (таблицу со ставками не удалять).
