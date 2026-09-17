---
manifest_id: EVID-TASK-2026-003-01
task_id: TASK-2026-003
submission_id: SUB-TASK-2026-003-01
app_commit: afc85f6feb6dda989b6efda8aec6d5b1a0527e86
created_at: 2026-09-17T16:34:56+05:00
---

# Evidence manifest — attempt 01

| Evidence ID | AC ID | Тип | Что доказывает | Environment | Role/scope | Path/URL | Ограничения |
|---|---|---|---|---|---|---|---|
| EVID-003-01 | AC-003-01, AC-003-08 | migration + DB test | `active_membership_id` не может выбрать membership другого user; apply/reapply безопасен | local + preview DB | synthetic | `db/migrations/0002_explicit_access_context.sql`, `test/migration-0002.test.mjs` | independent rerun pending |
| EVID-003-02 | AC-003-01 | schema constraint | Составной FK связывает session membership с тем же user | source | N/A | exact app commit | source evidence only |
| EVID-003-03 | AC-003-02, AC-003-03, AC-003-05 | auth/service tests | Нет priority role selection; exact membership switch; same-origin; audit | local | session user | `test/explicit-access-context.test.mjs` | independent rerun pending |
| EVID-003-04 | AC-003-04, AC-003-07 | authorization tests | Все private runtime API имеют server guard; response projections очищены по роли | local | client/logistician/manager | `test/private-api-guard.test.mjs`, `test/role-safe-projection.test.mjs` | source-based regression suite |
| EVID-003-05 | AC-003-08 | CI | typecheck, lint, tests и build прошли на exact head | GitHub Actions | N/A | <https://github.com/alanbykov11work-ux/exim/commit/afc85f6feb6dda989b6efda8aec6d5b1a0527e86/checks> | point-in-time result |
| EVID-003-06 | AC-003-03, AC-003-04, AC-003-05, AC-003-06, AC-003-07, AC-003-09 | preview acceptance matrix | A1/A2/B1 isolation; 7/7 role matrix; foreign membership 404; disabled module 403; healthy DB and neighbouring services | managed preview | seven synthetic accounts, two tenants | <https://superapp.185-129-49-242.sslip.io/app> | credentials and raw payloads intentionally omitted |
| EVID-003-07 | AC-003-02 | browser flow | Login redirects to chooser; client and manager contexts visible; explicit manager selection opens `/app`; switch link exists | managed preview | synthetic manager | public preview URL | manager dashboard count inconsistency recorded in submission |
| EVID-003-08 | AC-003-08, AC-003-10 | Git/PR | Exact code head, clean application branch, stacked base and no self-merge | GitHub | contributor | <https://github.com/alanbykov11work-ux/exim/pull/7> | PR depends on PR #6 |

## Redaction declaration

- No passwords, cookies, tokens, secrets, `.env` values or real personal data are stored in this manifest.
- Synthetic fixture prices and text have no commercial or contractual meaning.
- Server backup path is recorded in the submission, but backup contents and credentials are not exposed.
