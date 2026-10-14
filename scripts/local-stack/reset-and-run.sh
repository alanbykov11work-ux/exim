#!/usr/bin/env bash
# Disposable local stack (storage schema is exposed only to simulate Storage API uploads under the user JWT):
# fresh database, full migration chain, fixtures, PostgREST, REST Gate scenario.
# Requires: PostgreSQL 16 server reachable as PG_ADMIN_URL (superuser on a throwaway instance),
#           PostgREST 12 binary as POSTGREST_BIN, Node 20+. Nothing here talks to a hosted project.
set -euo pipefail
: "${PG_ADMIN_URL:?}"; : "${POSTGREST_BIN:?}"
DB="${EXIM_LOCAL_DB:-exim_local_$(date +%s)}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
psql "$PG_ADMIN_URL" -qc "create database $DB"
URL="$(echo "$PG_ADMIN_URL" | sed -E "s#/postgres(\?|$)#/$DB\1#")"
export DATABASE_URL="$URL" EXIM_TARGET=non-production PGOPTIONS='-c client_min_messages=warning'
"$ROOT/scripts/local-stack/apply.sh" --with-compat
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qf "$ROOT/scripts/local-stack/fixtures.sql"
SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '/+=' | head -c 48)"
CONF="$(mktemp)"; PORT="${REST_PORT:-3011}"
printf 'db-uri = "%s"\ndb-schemas = "public,storage"\ndb-anon-role = "anon"\njwt-secret = "%s"\nserver-port = %s\n' \
  "$(echo "$DATABASE_URL" | sed 's#//[^@]*@#//authenticator@#')" "$SECRET" "$PORT" > "$CONF"
"$POSTGREST_BIN" "$CONF" > "${CONF}.log" 2>&1 & PID=$!
trap 'kill $PID 2>/dev/null; rm -f "$CONF"' EXIT
sleep 3
REST_URL="http://localhost:$PORT" JWT_SECRET="$SECRET" node "$ROOT/e2e/rest-gate.e2e.mjs"
