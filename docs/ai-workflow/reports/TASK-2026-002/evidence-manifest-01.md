---
manifest_id: EVID-TASK-2026-002-01
task_id: TASK-2026-002
submission_id: SUB-TASK-2026-002-01
app_commit: 3a94d0009c5996febf400aab9af7281eee9af95c
created_at: 2026-09-17T12:06:10+05:00
---

# Evidence manifest

| Evidence ID | AC ID | Тип | Что доказывает | App commit | Environment | Role | Tenant/client scope | Captured at + TZ | Path/URL | SHA-256 | Redaction | Ограничения |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EVID-002-01 | AC-002-01, AC-002-03, AC-002-12 | source + image identity | Exact source commit соответствует deployed image `sha256:eba2b5f10b4a7acbfb23aa9089109f02f8a2e6c8096e201db18be7172d5642cc` | `3a94d0009c5996febf400aab9af7281eee9af95c` | GitHub + managed server | implementer/operator | synthetic preview | 2026-09-17 12:02 +05 | <https://github.com/alanbykov11work-ux/exim/commit/3a94d0009c5996febf400aab9af7281eee9af95c> | image digest listed | secrets omitted | image digest does not replace independent review |
| EVID-002-02 | AC-002-01, AC-002-02 | container/network inspection | web healthy on own backend + `exim-managed-edge`; DB healthy only on own backend; no published host binding | same | managed server | operator | infrastructure | 2026-09-17 12:02 +05 | summarized in `submission-01.md` | N/A | IP/MAC values not persisted | point-in-time inspection |
| EVID-002-03 | AC-002-03–AC-002-08 | automated verification | typecheck, lint, build, 12/12 tests, migration apply/idempotency and runtime audit PASS | same | local + PostgreSQL 16 | implementer | synthetic fixtures | 2026-09-17 11:30 +05 | PR #6 checks and submission command table | N/A | no env/log secrets committed | independent rerun pending |
| EVID-002-04 | AC-002-04–AC-002-07, AC-002-11 | public E2E/API smoke | registration, sessions, state, documents, tenant denial, workflow read, callback, logout and HTTP boundaries PASS | same | <https://superapp.185-129-49-242.sslip.io/app> | separate synthetic accounts | two synthetic tenants/client scopes | 2026-09-17 11:58 +05 | public preview + submission command table | N/A | credentials/cookies omitted | does not cover unsupported full business write flows |
| EVID-002-05 | AC-002-09, AC-002-12 | backup/restore/export | fresh PostgreSQL dump checksum OK; isolated restore produced 29 tables; documents archive checksum OK | same | managed server | operator | synthetic data only | 2026-09-17 12:03 +05 | `/home/eximadmin/exim-superapp/export/` (operator-only, mode 600) | sidecars stored with artifacts | filenames only; content not exposed | backup remains on same host; off-machine copy pending |
| EVID-002-06 | AC-002-02, AC-002-10 | exact-SHA CI + remote regression | Hub six lanes PASS, remote Chromium 20/20, Hub/Daily health and operations smoke PASS after edge update | same | GitHub Actions + Technical Staging | CI/operator | Hub synthetic staging | 2026-09-17 11:57 +05 | <https://github.com/morgiyt/exim-hub/actions/runs/35191052833> | Hub commit `77703824d09ddfeb4c647b4b1c77449b95208635` | no credentials or records | Hub evidence is a separate repository/commit |
| EVID-002-07 | AC-002-11 | source/UX boundary | README and preview registration copy identify Technical Preview limitations; legacy unsupported writes are rejected | same | repository + preview | implementer/client | synthetic preview | 2026-09-17 12:00 +05 | `README.md`, `public/exim/modules.js`, `docs/application-readme.md` | Git commit identity | no secrets | requires independent product review |
| EVID-002-08 | AC-002-12 | application submission | Exact branch diff, migration, rollback, checks, risks and preview URL are reviewable | same | GitHub | implementer | N/A | 2026-09-17 12:06 +05 | <https://github.com/alanbykov11work-ux/exim/pull/6> | Git commit identity | no secrets | PR is open; not accepted or merged |

## Правила

- Screenshot не используется как доказательство server authorization.
- Build не считается доказательством полного end-to-end workflow.
- Preview соответствует exact deployed code commit; последующие report-only commits не меняют server image.
- Failed/NOT_RUN/limitations перечислены в submission и не скрыты.
- Evidence не содержит credentials, tokens, cookies, secrets и реальные персональные данные.
