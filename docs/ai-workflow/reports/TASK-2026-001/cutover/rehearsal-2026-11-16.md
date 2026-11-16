# Production cutover rehearsal — 2026-11-16

Authorization: owner comment in PR #8, 2026-11-13 (production update with backup, data preservation, rollback).
Mapping decision (Alan, 2026-11-16): «перенос как есть» — see `supabase/foundation_wave_6_prod_legacy_backfill.sql`.

## Target (read-only checks)
- Vercel project `exim-super-app` (prj_IyTZj5Z7MJSGTikBIP262a6bgzqb), production deployment dpl_GqjXnJAkkqWCgnCDGQkapjBXNskT at `c5e3ca4`, aliases exim-super-app.vercel.app. Git link: repo `alanbykov11work-ux/exim-super-app`, branch main.
- Supabase project `nfqdbuzelohxjetdeuxn` (Exim SuperApp), Postgres 17. Env vars unchanged by this release (URL + anon key only).
- Data: 26 auth users (10 staff `admin`, 16 clients), 6 orders, 10 order_history, 5 chats / 26 members / 39 messages, 2 tasks, 1 lead, 1 storage object. No workspace/tenant schema yet.

## Backup
Logical backup of every public table, auth.users/identities, storage metadata, functions, policies, constraints, indexes, columns via the Management API (read-only), kept on Alan's Mac outside Git with SHA256SUMS. Not in Git (PII + password hashes).

## Replica
PostgreSQL 16 + Supabase compat; legacy SQL (schema…admin_roles) + `prod-drift-2026-11-16.sql` reproduces production exactly: columns, functions (bodies up to comments), policies (qual/with_check), constraints, indexes, triggers — all identical. Data loaded from the backup; row counts identical.

## Results
| Step | Result |
|---|---|
| Waves 1…5b on production replica | PASS (all 15 apply, one transaction each) |
| Visibility right after waves, without backfill | FAIL as expected (RB-3): staff lose all rows, clients lose orders/chats |
| + wave 6 backfill: per-user fingerprint (count + md5 ids) for orders, chats, members, messages, tasks, comments, leads, lead history vs. before | PASS — identical for all 26 users |
| Intended tightening (Gate security, AC-TASK-004/005) | clients: profiles 11 → 1 (own only), internal order_history 1–5 → 0 |
| DB rollback A: restore pre-cutover dump into a new DB | PASS — fingerprint identical |
| DB rollback B (`rollback-db.sql` + legacy rebuild + data reload) on the migrated replica | PASS — fingerprint, columns, policies, functions identical to production |
| GoTrue login, Storage, browser flow on production data | NOT_RUN in rehearsal (no second Supabase project: free-plan limit). Checked after cutover. |
