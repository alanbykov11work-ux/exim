# TASK-2026-001 — Wave 5a (REQ-003): версионируемый workflow Foundation Gate

Миграция: `supabase/foundation_wave_5a_workflow.sql` (после 4c). Адресует AC-TASK-012, 013, 016, 017.

## Модель

`workflow_templates`, `workflow_template_versions` (неизменяемые; владелец может только перевести версию в `retired`), `workflow_instances` (объект закреплён за версией при создании и не переключается), `workflow_history` (append-only: старый/новый этап, автор, membership, комментарий, время).

Засеяны system-шаблоны v1 строго по Product OS (REQ-003, lifecycles): QuoteRequest, Shipment exim.kz, Trip. TBD / Post-Gate переходы присутствуют в определении с `enabled: false` и сервером отклоняются. Шаблоны доступны активным участникам только на чтение.

## Движок

`wf_transition(type, object, to, comment)` — единственный путь смены этапа: проверяет закреплённую версию, разрешённость перехода, роль (`client` своей компании, `manager`, `logistician`, `system`), entitlement `private_os`, обязательный комментарий; пишет историю; производные legacy-колонки (`orders.status`, `transports.stage/status`, `trips.trip_stage`) обновляются только им. Прямая смена статуса заявки закрыта. Tenant-admin override отсутствует (как в Gate).

## Действия QuoteRequest

`save_request(submit)` draft→manager_review · `return_for_clarification` manager_review→data_required · `logist_request_data` sent_to_logistician→data_required · `answer_clarification` / `revise_order` data_required→manager_review (правка полей — только в manager_review/data_required; recalculation — TBD) · `assign_logist` manager_review→sent_to_logistician (логист workspace, маршрут, груз, вес, объём) · `logist_accept` →rate_search · RateQuote только в rate_search и только назначенным логистом; первая ставка не меняет этап · `complete_rate_search` →rate_received при ≥2 валидных ставках (дата, срок, цена, валюта, доступность, маршрут, транспорт, источник, комментарий) · `select_rate` →offer_preparation с аудитом · `send_offer` →offer_to_client (из offer_preparation или clarification_requested; нужна выбранная ставка; смена цены — с причиной) · `request_offer_clarification` →clarification_requested · `decide_offer(…, reason)` →approved/rejected (отказ — с причиной) · `record_agreement` approved→contract_pending→contract_signed (тип, номер/ссылка, дата) · `create_shipment` →converted_to_shipment→closed (system), ровно один Shipment · `close_without_rate` (менеджер, причина).

## Shipment и Trip

`advance_shipment(…, occurred_at, location)`: preparation→factory_contact→pickup_waiting (комментарий обязателен)→loading→in_transit (дата/время и место обязательны); только назначенный логист. Trip v1: `create_trip` (назначенный логист, идемпотентно, номер, откуда/куда, вид транспорта) → `assign_trip_transport` (перевозчик и ссылка по виду транспорта; для авто — машина и водитель) → `advance_trip` loading/in_transit (дата/время, место, источник). Дальше — отключено.

## Клиентский слой

`workflow_stages(type, ids[])`: клиенту — только клиентское название этапа из шаблона, без внутреннего кода и версии; история клиенту недоступна.

## Совместимость

Объекты, созданные до 5a, получают instance при первом переходе с этапом, выведенным из старого статуса. Поведение функций Wave 3–4c, которые здесь переопределены, меняется: например, повторная отправка предложения из `offer_sent`/`rejected` больше не разрешена (не входит в Gate). Тесты волн 3–4c проверяют свои снимки без 5a.

Тест: `test/foundation-wave-5a-db.test.mjs` (полный путь трёх ролей, негативные переходы и роли, версии, история с membership, клиентские метки, entitlement). Preview — BLOCKED (blocker-02).

Откат: `git revert`; в БД — `drop trigger orders_wf_guard on public.orders`, `drop trigger wf_on_insert on public.orders/transports/trips`; таблицы workflow и историю не удалять.
