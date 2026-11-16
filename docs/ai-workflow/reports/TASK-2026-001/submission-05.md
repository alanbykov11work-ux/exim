# Submission 05 — TASK-2026-001: production update 2026-11-16

Status `in_progress`; not self-accepted. Basis: owner authorization in PR #8 (2026-11-13) and `docs/ai-workflow/deployment-policy.md` (3b62440).

## Released
- Code: `59e02208149eb5e1929af4efa339b5888dc055ca` (CI: install/test/typecheck/lint/build — success; repository-safety — success).
- Vercel project `exim-super-app` (prj_IyTZj5Z7MJSGTikBIP262a6bgzqb), production deployment `dpl_CRitxLSp7jinSZ9mSq6KtTKTnCbf`, alias https://exim-super-app.vercel.app. Previous production: `dpl_GqjXnJAkkqWCgnCDGQkapjBXNskT` (`c5e3ca4`) — Instant Rollback target.
- Supabase `nfqdbuzelohxjetdeuxn`: 16 migrations (`foundation_wave_1` … `5b`, `foundation_wave_6_prod_legacy_backfill`) recorded in `public.schema_migrations` with SHA-256.

## Data preservation
- Fresh logical backup 2026-11-16T08:53Z (all public tables, auth users/identities, storage metadata; SHA256SUMS) — kept off Git on the integrator's Mac.
- Rehearsal on an exact production replica first (`cutover/rehearsal-2026-11-16.md`); replica fingerprints matched production for all 26 users before the change.
- Production per-user visibility fingerprint (count + md5 of ids, 10 tables × 26 users) before vs after: **0 losses**. Orders, history for staff, chats, members, messages, tasks, comments, leads — identical. Intended tightening: clients see only their own profile (11→1) and no internal order history (3 clients).
- Mapping «как есть» (Alan): one workspace EXIM; 10 legacy staff → `tenant_admin`; 16 clients → one client company each; nothing merged by guessing.

## Smoke after release
| Check | Result |
|---|---|
| `/` and `/app` without session → `/login` | PASS |
| Served `public/exim/workflow.js` = release commit (md5) | PASS |
| DB visibility per user before/after | PASS (0 losses) |
| Real login of existing users, cabinets, documents/Storage, end-to-end flow | NOT_RUN by Claude (no user credentials) — Alan to verify |

## Incidents
- Bridge to the integrator's Mac dropped during the first run; nothing was applied by it (backup only). The second run applied waves 1–4a, then the runner process stopped; for ~10 minutes production had partial schema (old rows hidden). Remaining waves 4b–6 applied one by one; final state verified as above.

## Rollback
Frontend: Vercel Instant Rollback to `dpl_GqjXnJAkkqWCgnCDGQkapjBXNskT`. Database: `cutover/rollback-db.sql` + legacy rebuild + data reload from the backup (rehearsed, fingerprints identical).

## Residual risks
- Vercel project is Git-linked to repo `alanbykov11work-ux/exim-super-app` (main). Any push there redeploys old frontend against the new schema. Needs: bring PR #8 code into that repo's main or relink the project to `exim`.
- Staff roles collapsed to `tenant_admin`; client companies 1:1 — to be refined by an admin.
- One storage object not downloaded into the backup (metadata only).
