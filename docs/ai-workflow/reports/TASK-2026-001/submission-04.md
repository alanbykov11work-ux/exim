# Submission 04 — TASK-2026-001

Code SHA `ef0a8344c5527669ff29c46a90e3d800e2d40edf`; статус `in_progress`; самоприёмки нет.

## Сделано
- `ef0a834`: preflight — строгий allowlist URI (только host=/port= по одному разу), отказ hostaddr/dbname/service/options/дубликатов/percent-encoding/multi-host/authority+host= и унаследованных PGHOST/PGHOSTADDR/PGDATABASE/PGSERVICE/PGSERVICEFILE/PGSYSCONFDIR/PGPASSFILE/PGPORT. Red→green: старый код 49/98 FAIL, новый 98/98. CI success; Codex подтвердил exit 2 на трёх обходах.
- Тесты: fileURLToPath, явный поиск bash (иначе skip NOT_RUN), обязательные error/signal/status=2/маркер, positive с `set -e`, self-tests (нет bash, сломанный source).
- demo-guide-2026-11-10.md, release-readiness-2026-11-10.md.

## Не прошло / заблокировано
- BLOCKED: test Supabase + Preview — proxy 403 на api.supabase.com/api.vercel.com (RB-1). Действие Alan указано в demo-guide.
- NOT_RUN: настоящий /app, GoTrue, Storage, Realtime, сквозной сценарий на hosted backend, hosted rollback.
- Production не трогался; deploy на рабочий сервер отклонён (RB-3).
