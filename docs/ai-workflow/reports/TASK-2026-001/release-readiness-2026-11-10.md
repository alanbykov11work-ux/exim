# Release readiness — TASK-2026-001 (Foundation Gate), 10.11.2026

Code SHA `ef0a8344c5527669ff29c46a90e3d800e2d40edf`. Только текущий Gate, не весь Super App. Источник статусов: submission-02 (матрица AC), submission-03, evidence-01..03; новых hosted-доказательств нет.

## AC

| AC | Статус | Доказательство | Hosted |
|---|---|---|---|
| AC-TASK-001 | BLOCKED | E2-01, E2-06 | NOT_RUN |
| AC-TASK-002 | BLOCKED | E2-02 | NOT_RUN |
| AC-TASK-003 | PASS_BY_IMPLEMENTER (local) | E2-07 | NOT_RUN |
| AC-TASK-004 | PASS_BY_IMPLEMENTER (local) | E2-07 | NOT_RUN |
| AC-TASK-005 | PASS_BY_IMPLEMENTER (local) | E2-07 | NOT_RUN |
| AC-TASK-006 | PASS_BY_IMPLEMENTER (PGlite) | E2-02 | NOT_RUN |
| AC-TASK-007 | PASS_BY_IMPLEMENTER (local + MOCK) | E2-07, E2-09 | NOT_RUN |
| AC-TASK-008 | PASS_BY_IMPLEMENTER (local + MOCK) | E2-07, E2-09 | NOT_RUN |
| AC-TASK-009 | PASS_BY_IMPLEMENTER (MOCK + unit) | E2-02, E2-09 | NOT_RUN |
| AC-TASK-010 | PASS_BY_IMPLEMENTER (MOCK) | E2-09 | NOT_RUN |
| AC-TASK-011 | PASS_BY_IMPLEMENTER (local) | E2-07 | NOT_RUN |
| AC-TASK-012 | PASS_BY_IMPLEMENTER (PGlite + local) | E2-02, E2-07 | NOT_RUN |
| AC-TASK-013 | PASS_BY_IMPLEMENTER (local) | E2-07 | NOT_RUN |
| AC-TASK-014 | PASS_BY_IMPLEMENTER (local) | E2-07 | NOT_RUN |
| AC-TASK-015 | PASS_BY_IMPLEMENTER (local) | E2-07 | NOT_RUN |
| AC-TASK-016 | PASS_BY_IMPLEMENTER (local) | E2-07 | NOT_RUN |
| AC-TASK-017 | PASS_BY_IMPLEMENTER (local) | E2-07 | NOT_RUN |
| AC-TASK-018 | PASS_BY_IMPLEMENTER (local) | E2-07 | NOT_RUN |
| AC-TASK-019 | PASS_BY_IMPLEMENTER (local) | E2-07 | NOT_RUN |
| AC-TASK-020 | PASS_BY_IMPLEMENTER (PGlite + local) | E2-02, E2-07 | NOT_RUN |
| AC-TASK-021 | PASS_BY_IMPLEMENTER (MOCK + PGlite) | E2-02, E2-09 | NOT_RUN |
| AC-TASK-022 | BLOCKED | все | NOT_RUN |

## Release blockers

| # | Серьёзность | Описание | Воспроизведение | Ответственный | Следующее действие |
|---|---|---|---|---|---|
| RB-1 | critical | Нет доступа к отдельному test Supabase/Preview из среды исполнителя | `curl https://api.supabase.com` → proxy 403 | Alan | разрешить домены в claude.ai Capabilities |
| RB-2 | critical | Настоящий `/app` + GoTrue + Storage не проверены | — | Claude после RB-1 | прогон сценария demo-guide |
| RB-3 | critical | Production-миграция скрывает legacy-строки без workspace | `ЗАПУСК.md` §4, wave-1b | владелец | отдельный план миграции реальных данных (scope backfill) до любого production |
| RB-4 | high | Rollback на hosted БД не репетировался | rollback-rehearsal только локально | Claude после RB-1 | backup/restore на test-проекте |

## Миграции / backup / rollback

23 файла по порядку `scripts/local-stack/apply.sh` (ЗАПУСК.md §4). Локально: apply + pg_dump/pg_restore rehearsal PASS (submission-03). Hosted: NOT_RUN.

## Verdict

- Demo: **BLOCKED** (RB-1). Код и локальные проверки готовы.
- Release текущего Gate: **NOT READY** (RB-1…RB-4). Самоприёмки нет.
