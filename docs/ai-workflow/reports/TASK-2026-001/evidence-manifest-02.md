---
manifest_id: EVID-TASK-2026-001-02
task_id: TASK-2026-001
submission_id: SUB-TASK-2026-001-02
app_commit: c066519b16cca90c2a71fb200922df7bc928d814
created_at: 2026-10-14T12:00:00Z (UTC)
---

# Evidence manifest 02

Файлы: `evidence-02/`; суммы: `evidence-02/SHA256SUMS`. Все прогоны — на дереве `c066519` (VM: рабочая копия; облако: `git archive c066519`).

| Evidence ID | AC | Тип | Что доказывает | Environment | Файлы и SHA-256 | Ограничения |
|---|---|---|---|---|---|---|
| E2-01 | 001,022 | install | `npm ci` с lifecycle scripts | VM интегратора | `evidence-02/runtime.txt` `c620fe759386f1236c3f47f07805b9d4dd6cac999dd847e1bdf648bf6da4106f`<br>`evidence-02/npm-ci.txt` `e963dd6f0122a389c9c28b89a5d356eb8ad985cd81e8bf6a68a9187ab7eceee6` |  |
| E2-02 | 002–021 | unit/PGlite | 52/52 тестов | VM, PGlite 0.5.8 | `evidence-02/npm-test.txt` `c4017f4e8cb3aea5b11477e5e82ea306620772ec56d012040fae2a9141ec6156` | PGlite ≠ hosted |
| E2-03 | 022 | typecheck | tsc PASS | VM | `evidence-02/typecheck.txt` `28d3b9e880a77975493dc7e359144c0295a4f694cfe0af4f928c22307bc5c320` |  |
| E2-04 | 022 | lint | next lint PASS | VM | `evidence-02/lint.txt` `36316d40975be8ba14a0b84e65352d6317ac13b0c31c5fca480fadd0785c7e8f` |  |
| E2-05 | 022 | build | next build PASS | VM, placeholder env | `evidence-02/build.txt` `44ab9e1039ffb413fcabbc2771cf28af0b209a22d78e4f7f5f9f923e21da79bc` | build ≠ E2E |
| E2-06 | 001,022 | migration apply | полный chain с журналом SHA-256 | PostgreSQL 16.15 (локально) | `evidence-02/migration-apply.txt` `efe06ccecbf2b703bdf7c871ac77aeecf3d8e9d6c60ee4b6ce96972b75671740`<br>`evidence-02/cloud-runtime.txt` `f3f2f2f31a06ea4519f31e02aa6ce85ca98c8e80f28e88749c0ab4d410544503` | не hosted |
| E2-07 | 003–020 | REST/RPC | 85/85: 7 аккаунтов, 2 tenant | PostgreSQL 16.15 + PostgREST 12.2.3 | `evidence-02/rest-gate-result.txt` `9a88d46f70ccf1913cbc9644762fa35440b53225105e64db42577c5c01cc297e` | нет GoTrue/Storage API/Realtime |
| E2-08 | 022 | rollback | восстановление из копии 4c→5a, 5a→5b | локально | `evidence-02/rollback-rehearsal-4c-to-5a.txt` `e3056c1bd0c3d8550d687a41130f9cb33d2fc922ed7d7670d6d04a9334ffd163`<br>`evidence-02/rollback-rehearsal-5a-to-5b.txt` `0879df90362b5a8f08c453547fd981f4a87c19f99f112e9e2da3916bc6e91f2a` | disposable copy |
| E2-09 | 007–010,021 | browser E2E MOCK | 20/20 | Chromium/Playwright 1.56, подменённый backend | `evidence-02/e2e-mock-result.json` `dfaad0cd4452f8a7ef6949e68580f50517e80bfbc328cfa2f20e9550873ee0fe` | MOCK, не hosted |
| E2-10 | — | dependency audit | 7 записей | VM | `evidence-02/npm-audit-summary.json` `9b6b240aa08cb31f41a42fd1e3cc6fe51ab05e2cea15f5aeff15d0b4ad0097dd` | advisory ≠ эксплойт |

Роли и scope синтетические (`scripts/local-stack/fixtures.sql`); секреты JWT генерируются на запуск и не сохраняются. Credentials, cookies и реальные персональные данные отсутствуют.
