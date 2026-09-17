#!/bin/sh
set -eu

: "${MIGRATION_DATABASE_URL:?MIGRATION_DATABASE_URL is required}"
DATABASE_URL="$MIGRATION_DATABASE_URL"

MIGRATIONS_DIR="${MIGRATIONS_DIR:-/migrations}"
if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "Migration directory does not exist: $MIGRATIONS_DIR" >&2
  exit 1
fi

psql "$DATABASE_URL" --set=ON_ERROR_STOP=1 <<'SQL'
create table if not exists public.schema_migrations (
  version text primary key,
  checksum text not null,
  applied_at timestamptz not null default now()
);
SQL

found=0
for file in "$MIGRATIONS_DIR"/*.sql; do
  [ -f "$file" ] || continue
  found=1
  version="$(basename "$file")"
  checksum="$(sha256sum "$file" | awk '{print $1}')"
  recorded="$(psql "$DATABASE_URL" --set=ON_ERROR_STOP=1 --tuples-only --no-align \
    --set=version="$version" \
    -c "select checksum from public.schema_migrations where version = :'version'")"

  if [ -n "$recorded" ]; then
    if [ "$recorded" != "$checksum" ]; then
      echo "Checksum mismatch for already applied migration: $version" >&2
      exit 1
    fi
    echo "Already applied: $version"
    continue
  fi

  echo "Applying: $version"
  psql "$DATABASE_URL" --set=ON_ERROR_STOP=1 --single-transaction --file="$file"
  psql "$DATABASE_URL" --set=ON_ERROR_STOP=1 \
    --set=version="$version" --set=checksum="$checksum" \
    -c "insert into public.schema_migrations(version, checksum) values (:'version', :'checksum')"
done

if [ "$found" -ne 1 ]; then
  echo "No migrations found in $MIGRATIONS_DIR" >&2
  exit 1
fi
