# TASK-2026-001 — Wave 4c (AC-TASK-016, AC-TASK-017): workflow перевозки и рейса

Миграция: `supabase/foundation_wave_4c_shipment_workflow.sql` (после 4b).

- Перевозка: колонка `stage` — `preparation → factory_contact → pickup_waiting → loading → in_transit`. Переход — только `advance_shipment(transport, to_stage, note)`, только назначенный логист, только на следующий шаг. Обязательные данные: результат связи с фабрикой; перед погрузкой — хотя бы один рейс; перед «В пути» — хотя бы один рейс в пути. Дальнейшие и проблемные переходы отклоняются. История — `shipment_stage_history` (клиент видит этапы без заметки), аудит `shipment.stage_changed`.
- Старые `status`/`progress` вычисляются из `stage` для scoped-перевозок; прямое изменение запрещено — все экраны показывают одно состояние. Legacy-строки без workspace не трогаются.
- Рейс: `create_trip(transport, client_key, mode, route, …, assignee)` — идемпотентно по ключу, номер по порядку, маршрут, вид транспорта, исполнитель (сотрудник workspace); для авто обязательны перевозчик и номер машины. Прямой INSERT закрыт. `advance_trip(trip, to_stage)`: `planned → loading → in_transit`, только исполнитель рейса. Аудит `trip.created`, `trip.stage_changed`.
- `client_trips` отдаёт номер, маршрут, вид транспорта, этап и плановые даты — без перевозчика, машины и водителя.
- UI: шкала этапов в карточке перевозки, кнопка «Далее» у назначенного логиста, создание рейса через функцию с ключом, перевод рейса по этапам.
- Тест: `test/foundation-wave-4c-db.test.mjs`. Preview — BLOCKED (blocker-02).
- Откат: `git revert`; в БД — `drop trigger transports_stage_guard on public.transports; drop trigger trips_write_guard on public.trips`. Колонки и историю не удалять.
