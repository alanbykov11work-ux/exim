#!/bin/sh
set -eu

: "${BACKUP_DATABASE_URL:?BACKUP_DATABASE_URL is required}"
DATABASE_URL="$BACKUP_DATABASE_URL"

BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

case "$BACKUP_RETENTION_DAYS" in
  ''|*[!0-9]*) echo "BACKUP_RETENTION_DAYS must be a positive integer" >&2; exit 1 ;;
esac
[ "$BACKUP_RETENTION_DAYS" -ge 1 ] || { echo "BACKUP_RETENTION_DAYS must be at least 1" >&2; exit 1; }

resolved_dir="$(realpath "$BACKUP_DIR")"
if [ "$resolved_dir" != "/backups" ]; then
  echo "Refusing to write outside the dedicated /backups volume" >&2
  exit 1
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
final="$resolved_dir/exim-superapp-$timestamp.dump"
partial="$final.partial"

umask 077
trap 'rm -f "$partial"' EXIT INT TERM
pg_dump "$DATABASE_URL" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --file="$partial"
mv "$partial" "$final"
(cd "$resolved_dir" && sha256sum "$(basename "$final")" > "$(basename "$final").sha256")
trap - EXIT INT TERM

find "$resolved_dir" -maxdepth 1 -type f \
  \( -name 'exim-superapp-*.dump' -o -name 'exim-superapp-*.dump.sha256' \) \
  -mtime "+$BACKUP_RETENTION_DAYS" -delete

echo "$final"
