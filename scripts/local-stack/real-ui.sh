#!/usr/bin/env bash
# Real SPA + real supabase-js in Chromium against a fresh disposable database (PostgreSQL 16 + PostgREST 12).
# Requires PG_ADMIN_URL (throwaway instance), POSTGREST_BIN, Playwright (PW), supabase-js UMD (SUPABASE_UMD or node_modules).
set -euo pipefail
: "${PG_ADMIN_URL:?}"; : "${POSTGREST_BIN:?}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB="exim_ui_$(date +%s)"
psql "$PG_ADMIN_URL" -qc "create database $DB"
export DATABASE_URL="$(echo "$PG_ADMIN_URL" | sed -E "s#/postgres(\?|$)#/$DB\1#")" EXIM_TARGET=non-production PGOPTIONS='-c client_min_messages=warning'
"$ROOT/scripts/local-stack/apply.sh" --with-compat > /dev/null
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qf "$ROOT/scripts/local-stack/fixtures.sql"
SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '/+=' | head -c 48)"; PORT="${REST_PORT:-3013}"; CONF="$(mktemp)"
printf 'db-uri = "%s"\ndb-schemas = "public,storage"\ndb-anon-role = "anon"\njwt-secret = "%s"\nserver-port = %s\n' \
  "$(echo "$DATABASE_URL" | sed 's#//[^@]*@#//authenticator@#')" "$SECRET" "$PORT" > "$CONF"
"$POSTGREST_BIN" "$CONF" > "${CONF}.log" 2>&1 & PID=$!
trap 'kill $PID 2>/dev/null; rm -f "$CONF"' EXIT
sleep 3
cd "$ROOT" && REST_URL="http://localhost:$PORT" JWT_SECRET="$SECRET" node e2e/real/real-backend.e2e.mjs
