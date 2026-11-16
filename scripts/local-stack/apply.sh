#!/usr/bin/env bash
# Forward-only migration runner for a NON-PRODUCTION database.
# Each file runs in one transaction (-1). Applied files are recorded with SHA-256 in
# public.schema_migrations; an applied file is skipped, a changed applied file stops the run.
# Usage: DATABASE_URL=postgres://... scripts/local-stack/apply.sh [--with-compat]
# EXIM_APPLY_UNTIL=supabase/<file>.sql stops after that file (used by the rollback rehearsal).
# Refuses to run unless scripts/local-stack/preflight.sh accepts the target (see there).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
. "$ROOT/scripts/local-stack/preflight.sh"
exim_preflight work "${DATABASE_URL:-}"
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -X)
FILES=()
[ "${1:-}" = "--with-compat" ] && FILES+=(scripts/local-stack/00-supabase-compat.sql)
FILES+=(
  supabase/schema.sql supabase/workflow.sql supabase/chats_tasks.sql supabase/badges.sql supabase/crm.sql
  supabase/smart_ref.sql supabase/rate_limit.sql supabase/admin_roles.sql
  supabase/foundation_wave_1.sql supabase/foundation_wave_1b_legacy_scope.sql supabase/foundation_wave_1c_work_scope.sql
  supabase/foundation_wave_2_shell.sql supabase/foundation_wave_3a_rate_quotes.sql supabase/foundation_wave_3b_offers.sql
  supabase/foundation_wave_3c_revisions.sql supabase/foundation_wave_3d_request_form.sql supabase/foundation_wave_3e_clarifications.sql
  supabase/foundation_wave_3f_attachments.sql supabase/foundation_wave_4a_agreement_shipment.sql
  supabase/foundation_wave_4b_trips_tracking.sql supabase/foundation_wave_4c_shipment_workflow.sql
  supabase/foundation_wave_5a_workflow.sql supabase/foundation_wave_5b_audit_documents.sql
)
"${PSQL[@]}" -c "create table if not exists public.schema_migrations (filename text primary key, sha256 text not null, applied_at timestamptz not null default now()); revoke all on public.schema_migrations from public;"
UNTIL="${EXIM_APPLY_UNTIL:-}"
for f in "${FILES[@]}"; do
  sum=$(sha256sum "$ROOT/$f" | cut -d' ' -f1)
  prev=$("${PSQL[@]}" -tA -c "select sha256 from public.schema_migrations where filename = '$f'")
  if [ -n "$prev" ]; then
    if [ "$prev" != "$sum" ]; then echo "STOP: $f changed after it was applied ($prev -> $sum)" >&2; exit 3; fi
    echo "skip  $f"; continue
  fi
  "${PSQL[@]}" -1 -f "$ROOT/$f" -c "insert into public.schema_migrations(filename, sha256) values ('$f', '$sum')"
  echo "apply $f  $sum"
  if [ -n "$UNTIL" ] && [ "$f" = "$UNTIL" ]; then echo "stop after $UNTIL"; break; fi
done
