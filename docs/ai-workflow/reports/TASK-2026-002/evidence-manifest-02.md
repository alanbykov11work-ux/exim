---
manifest_id: EVID-TASK-2026-002-02
task_id: TASK-2026-002
submission_id: SUB-TASK-2026-002-02
app_commit: 2a140832b81a363c4589a6b781b12ed4cc67d1ed
created_at: 2026-09-17T14:57:21+05:00
---

# Evidence manifest — attempt 02

| Evidence ID | AC ID | Тип | Что доказывает | App commit | Environment | Role | Tenant/client scope | Captured at + TZ | Path/URL | SHA-256 | Redaction | Ограничения |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EVID-002-09 | AC-002-04, AC-002-05 | user reproduction | Public reverse-proxy registration раньше возвращала origin `403`; screenshot пользователя инициировал исправление | `3a94d00` | public preview | client | user-entered form, no account created | 2026-09-17 14:50 +05 | user-provided runtime evidence; no file committed | N/A | password не просматривался и не сохранялся | screenshot не доказывает server authorization |
| EVID-002-10 | AC-002-04, AC-002-05 | automated regression | Direct/configured proxy origin разрешён; foreign/malformed origin запрещён | `2a140832b81a363c4589a6b781b12ed4cc67d1ed` | local | implementer | N/A | 2026-09-17 14:53 +05 | `test/auth-origin-policy.test.mjs` | Git commit identity | no secrets | independent rerun pending |
| EVID-002-11 | AC-002-04, AC-002-05 | public HTTP verification | Canonical external Origin проходит до payload validation (`400`), foreign Origin остаётся `403` | same | public preview | anonymous browser-equivalent request | N/A | 2026-09-17 14:55 +05 | <https://superapp.185-129-49-242.sslip.io/register> | deployed image digest in submission | request bodies contained no real data | point-in-time check |
| EVID-002-12 | AC-002-04, AC-002-05, AC-002-12 | public E2E/API smoke | Registration/session/state/documents/tenant denial/workflow/callback/logout PASS after deployment | same | public preview | separate synthetic accounts | two synthetic tenants | 2026-09-17 14:56 +05 | submission-02 command table | N/A | credentials/cookies omitted | unsupported full business writes not covered |

## Правила

- Attempt 01 не изменён и сохраняет исходную ошибочную сдачу как часть истории.
- Evidence не содержит введённый пользователем пароль, cookies, tokens, secrets или реальные персональные данные.
- Final acceptance требует независимого review exact commit attempt 02.
