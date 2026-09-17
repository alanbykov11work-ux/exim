#!/bin/sh
set -eu

: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"
: "${BACKUP_FILE:?BACKUP_FILE is required}"

if [ "${RESTORE_CONFIRM:-}" != "YES_REPLACE_EXIM_SUPERAPP" ]; then
  echo "Restore is destructive. Set RESTORE_CONFIRM=YES_REPLACE_EXIM_SUPERAPP explicitly." >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-/backups}"
resolved_dir="$(realpath "$BACKUP_DIR")"
if [ "$resolved_dir" != "/backups" ]; then
  echo "Refusing to read outside the dedicated /backups volume" >&2
  exit 1
fi

case "$BACKUP_FILE" in
  /*) candidate="$BACKUP_FILE" ;;
  *) candidate="$resolved_dir/$BACKUP_FILE" ;;
esac

[ -f "$candidate" ] || { echo "Backup not found: $candidate" >&2; exit 1; }
resolved_file="$(realpath "$candidate")"
case "$resolved_file" in
  "$resolved_dir"/exim-superapp-*.dump) ;;
  *) echo "Backup must be an exim-superapp-*.dump file inside /backups" >&2; exit 1 ;;
esac

if [ -f "$resolved_file.sha256" ]; then
  (cd "$resolved_dir" && sha256sum -c "$(basename "$resolved_file").sha256")
else
  echo "Checksum file is missing for $resolved_file" >&2
  exit 1
fi

pg_restore \
  --dbname="$RESTORE_DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  "$resolved_file"

