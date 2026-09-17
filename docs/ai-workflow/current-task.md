# Текущий этап

| Поле | Значение |
|---|---|
| Application repository | `https://github.com/alanbykov11work-ux/exim.git` |
| Статус | `in_progress` |
| Current application task | `TASK-2026-003` — release foundation и явный access context |
| Product OS ref | `product-os-task-2026-003-r2` / `f783667681e81ba6368b09558f89bacdf7587def` |
| Application stacked baseline | `b3dd29751fbb9a6334f255e58576764dd44a29cd` |
| Implementation branch | `task/TASK-2026-003-release-foundation-identity` |
| Target environment | managed preview `superapp.185-129-49-242.sslip.io` |
| Data class | только синтетические test data; реальные клиентские данные запрещены |
| Production switch | `FORBIDDEN` до отдельной приёмки владельца |
| Следующее действие | migration 0002, explicit membership context, module guards, role/tenant matrix |

## Owner directive

17 сентября 2026 владелец утвердил полный roadmap и поручил начать разработку. Синтетические цены, тарифы и экранное наполнение разрешены только как явно помеченные demo placeholders. Финальный дизайн выполняется после функционального контура.

## Stacked dependency

TASK-2026-002 и PR #6 остаются submitted и не объявляются независимо принятыми. Новая ветка создана от exact head `b3dd297`; она не меняет PR #6 и не может быть слита в `main`, пока base dependency не включён или безопасно не rebased.

## Граница выполнения

- отдельный PostgreSQL/документы/backups сохраняются;
- активный workspace/role context определяется только серверной membership;
- ни один UI switch не создаёт и не повышает права;
- Hub и Super App не объединяются;
- production, реальные данные, реальные цены и скрытая коммерческая логика запрещены.

## История

| Дата | Было | Стало | Actor | Причина |
|---|---|---|---|---|
| 2026-09-17 | `TASK-2026-002 submitted` | `TASK-2026-002 superseded as delivery package; TASK-2026-003 in_progress` | Product owner authorization + Codex task curator | Утверждён полный roadmap; server foundation перенесён как точная stacked dependency без заявления acceptance |
