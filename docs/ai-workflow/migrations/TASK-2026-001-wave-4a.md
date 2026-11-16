# TASK-2026-001 — Wave 4a (REQ-006): выбранная ставка, договорное основание, одна перевозка

Миграция: `supabase/foundation_wave_4a_agreement_shipment.sql` (после 3e).

- `select_rate(order, rate)` — менеджер выбирает одну действующую ставку; хранится в `orders.selected_rate_id` (клиенту колонка недоступна), смена пишется в аудит.
- `agreement_bases` + `record_agreement(order, kind, signed_on, number, comment)` — только для заявки с согласованным предложением; основание: договор, допсоглашение, подписанное предложение, оплаченный счёт. Дата не в будущем. Повтор не создаёт второе основание. Статус `contract_signed` без основания недоступен.
- `create_shipment(order, ref)` — только после основания; переносит маршрут, клиента, компанию, логиста; хранит ссылки на предложение, основание и ставку. Уникальный индекс: одна перевозка на заявку; повторный вызов возвращает существующую. Прямой INSERT в `transports` для scoped-данных закрыт. Статус `converted` — только через эту функцию.
- Аудит: `order.rate_selected`, `order.agreement_recorded`, `shipment.created` в `tenant_audit_events`.
- UI: «Выбрать» у ставки, форма основания вместо кнопки «Договор подписан», создание перевозки через функцию с защитой от двойного нажатия.
- Тест: `test/foundation-wave-4a-db.test.mjs`. Preview — BLOCKED (нет staging).
- Откат: `git revert`; в БД — `drop trigger transports_create_guard on public.transports; drop trigger orders_contract_guard on public.orders`. Таблицы не удалять.
- Дальше (4b): Trip с полями по виду транспорта, события tracking, публикация клиентских версий.
