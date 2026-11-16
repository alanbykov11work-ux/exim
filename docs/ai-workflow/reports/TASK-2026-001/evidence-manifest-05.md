# Evidence manifest 05
| ID | What | Where |
|---|---|---|
| E5-01 | Release SHA + CI | 59e0220, PR #8 checks |
| E5-02 | Vercel deployment | dpl_CRitxLSp7jinSZ9mSq6KtTKTnCbf (prev dpl_GqjXnJAkkqWCgnCDGQkapjBXNskT) |
| E5-03 | Migration ledger | public.schema_migrations (16 rows) |
| E5-04 | Rehearsal + rollback | cutover/rehearsal-2026-11-16.md, rollback-db.sql, prod-drift-2026-11-16.sql |
| E5-05 | Visibility before/after | visibility-check.sql; results kept off Git with the backup (contain user ids) |
