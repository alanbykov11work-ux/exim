---
manifest_id: EVID-TASK-YYYY-NNN-01
task_id: TASK-YYYY-NNN
submission_id: SUB-TASK-YYYY-NNN-01
app_commit: REQUIRED
created_at: REQUIRED_WITH_TIMEZONE
---

# Evidence manifest

| Evidence ID | AC ID | Тип | Что доказывает | App commit | Environment | Role | Tenant/client scope | Captured at + TZ | Path/URL | SHA-256 | Redaction | Ограничения |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

## Правила

- Screenshot не доказывает server authorization.
- Build не доказывает полный end-to-end workflow.
- Admin view switcher не доказывает права отдельного role account.
- Preview обязан соответствовать `app_commit`.
- Failed evidence не удаляется.
- Evidence не содержит credentials, tokens, cookies, secrets и реальные персональные данные.
