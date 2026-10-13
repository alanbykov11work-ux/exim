---
manifest_id: EVID-TASK-2026-001-01
task_id: TASK-2026-001
submission_id: SUB-TASK-2026-001-01
app_commit: 64843fd3371488c50f5262f3fddebf362e343a69
created_at: 2026-10-13T12:10:00Z (UTC)
---

# Evidence manifest

Файлы лежат в `docs/ai-workflow/reports/TASK-2026-001/evidence-01/`; контрольные суммы — `evidence-01/SHA256SUMS`.

| Evidence ID | AC ID | Тип | Что доказывает | App commit | Environment | Role | Tenant/client scope | Captured at + TZ | Path/URL | SHA-256 | Redaction | Ограничения |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E-01 | 001, 022 | runtime + install | Версии runtime, `npm ci` проходит | `64843fd` | VM интегратора, Linux | — | — | 2026-10-13T12:06Z | `evidence-01/runtime.txt` | `287c2e19d8c370fad8ba612a471a2b791511c5b0eeebf4505bdb07195498f99b` | путь репозитория заменён на `<repo>` | Не hosted |
| E-02 | 002, 004–008, 011, 013–015, 017–021 | `npm test` | 49/49 PASS: SQL/RLS в PGlite, роутер, счётчики, загрузчик | `64843fd` | VM интегратора, PGlite 0.5.8 | синтетические роли в тестах | ws A/B, компании A1/A2/B1 | 2026-10-13T12:06Z | `evidence-01/npm-test.txt` | `022fff1bebb47b366ee0620603e64e42e01b8d745cac263aab5d2a2abc1bfccb` | путь заменён | PGlite ≠ Supabase/PostgREST |
| E-03 | 022 | typecheck | `tsc --noEmit` PASS | `64843fd` | VM | — | — | 2026-10-13T12:06Z | `evidence-01/typecheck.txt` | `28d3b9e880a77975493dc7e359144c0295a4f694cfe0af4f928c22307bc5c320` | — | — |
| E-04 | 022 | lint | `next lint` PASS | `64843fd` | VM | — | — | 2026-10-13T12:06Z | `evidence-01/lint.txt` | `36316d40975be8ba14a0b84e65352d6317ac13b0c31c5fca480fadd0785c7e8f` | — | — |
| E-05 | 022 | build | `next build` PASS | `64843fd` | VM, placeholder public env | — | — | 2026-10-13T12:06Z | `evidence-01/build.txt` | `45e80df730ded0b9fd0fab14994e08cd98cc5f50b1ac052546c9a5df0fd57675` | env не печатается | Build ≠ E2E |
| E-06 | 007–010 | browser E2E | 18/18: search/list→URL→Reload→Back/Forward, non-disclosure, malformed hash, error+Retry, server-only lists, 360/375/390 | `64843fd` (git archive) | облачная песочница, Chromium/Playwright 1.56 | manager (подмена) | один workspace (подмена) | 2026-10-13T12:07Z | `evidence-01/e2e-result.json`, `evidence-01/e2e-runtime.txt` | `e4c257cdbb876c3b84b896213ecfdb0329113cd968bb8f5fac878ffb83f0bdab`, `f96dfbde0ba0fa76f3efa76c30b285d0719e0c5b2963483102e44da17a586d70` | — | Backend подменён; не проверяет права сервера |
| E-07 | — | dependency audit | 7 записей после исправлений, разбор runtime/dev | `64843fd` | VM | — | — | 2026-10-13T12:06Z | `evidence-01/npm-audit-summary.json` | `7a69331721eacb4b1ba586b78fe51dc7e83797f15384bd8d4e8d2ca6ee8d7f12` | — | Advisory ≠ доказанный эксплойт |

## Правила

- Screenshot не доказывает server authorization.
- Build не доказывает полный end-to-end workflow.
- Admin view switcher не доказывает права отдельного role account.
- Preview обязан соответствовать `app_commit`.
- Failed evidence не удаляется.
- Evidence не содержит credentials, tokens, cookies, secrets и реальные персональные данные.
