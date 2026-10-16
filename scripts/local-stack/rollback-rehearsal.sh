#!/usr/bin/env bash
# Rollback rehearsal on a disposable copy: apply the chain up to the previous wave, add data,
# take a backup, apply the newest wave, then restore the backup into a fresh database and
# compare. Rollback of a released migration = restore from the pre-migration backup;
# disabling guard triggers is NOT considered a rollback.
set -euo pipefail
: "${PG_ADMIN_URL:?}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PREV="${PREV_WAVE:-supabase/foundation_wave_4c_shipment_workflow.sql}"
NEW_TABLE="${NEW_TABLE:-workflow_instances}"   # a table introduced after PREV
TS=$(date +%s); SRC="exim_rb_src_$TS"; DST="exim_rb_restored_$TS"
url() { echo "$PG_ADMIN_URL" | sed -E "s#/postgres(\?|$)#/$1\1#"; }
export EXIM_TARGET=non-production PGOPTIONS='-c client_min_messages=warning'
psql "$PG_ADMIN_URL" -qc "create database $SRC" -c "create database $DST"
DATABASE_URL="$(url $SRC)" EXIM_APPLY_UNTIL="$PREV" "$ROOT/scripts/local-stack/apply.sh" --with-compat > /dev/null
psql "$(url $SRC)" -v ON_ERROR_STOP=1 -qf "$ROOT/scripts/local-stack/fixtures.sql"
# synthetic data created through the previous wave's own command
psql "$(url $SRC)" -v ON_ERROR_STOP=1 -q <<'SQL'
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', false);
set role authenticated;
select * from public.save_request('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
  '{"contact_name":"К","origin":"Урумчи","destination":"Алматы","cargo":"текстиль","weight_kg":"1000","volume_m3":"10"}'::jsonb, true);
reset role;
SQL
snapshot() { psql "$1" -tA -c "select string_agg(t || '=' || n, ' ' order by t) from (
  select 'orders' t, count(*) n from public.orders union all select 'order_revisions', count(*) from public.order_revisions
  union all select 'memberships', count(*) from public.workspace_memberships union all select 'migrations', count(*) from public.schema_migrations) x"; }
BEFORE="$(snapshot "$(url $SRC)")"
pg_dump --no-owner --format=custom "$(url $SRC)" > "/tmp/$SRC.dump"
DATABASE_URL="$(url $SRC)" "$ROOT/scripts/local-stack/apply.sh" > /dev/null   # newest wave(s)
AFTER="$(snapshot "$(url $SRC)")"
# data created before the newest wave continues under it (instance pinned on first transition)
LEGACY=$(psql "$(url $SRC)" -v ON_ERROR_STOP=1 -tA <<'SQL'
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000003', false);
set role authenticated;
select public.assign_logist((select id from public.orders limit 1), 'a0000000-0000-4000-8000-000000000004', null);
reset role;
select string_agg(coalesce(from_stage, '-') || '>' || to_stage, ',' order by id) from public.workflow_history;
SQL
)
echo "legacy order history: $(echo "$LEGACY" | tail -1)"
pg_restore --no-owner --dbname="$(url $DST)" "/tmp/$SRC.dump"
RESTORED="$(snapshot "$(url $DST)")"
WF=$(psql "$(url $DST)" -tAc "select to_regclass('public.$NEW_TABLE') is null")
echo "before:   $BEFORE"; echo "after:    $AFTER"; echo "restored: $RESTORED"; echo "$NEW_TABLE absent after restore: $WF"
[ "$BEFORE" = "$RESTORED" ] && [ "$WF" = "t" ] && echo "$LEGACY" | tail -1 | grep -q "sent_to_logistician" && echo "ROLLBACK REHEARSAL PASS" || { echo "ROLLBACK REHEARSAL FAIL"; exit 1; }
