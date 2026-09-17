#!/bin/sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
EXPORT_DIR="${EXPORT_DIR:-/export}"
: "${BACKUP_FILE:?BACKUP_FILE is required}"

resolved_backup_dir="$(realpath "$BACKUP_DIR")"
resolved_export_dir="$(realpath "$EXPORT_DIR")"
[ "$resolved_backup_dir" = "/backups" ] || { echo "Unexpected backup directory" >&2; exit 1; }
[ "$resolved_export_dir" = "/export" ] || { echo "Unexpected export directory" >&2; exit 1; }

case "$BACKUP_FILE" in
  exim-superapp-*.dump) ;;
  *) echo "BACKUP_FILE must be an exim-superapp-*.dump filename" >&2; exit 1 ;;
esac

source_file="$resolved_backup_dir/$BACKUP_FILE"
[ -f "$source_file" ] || { echo "Backup not found: $source_file" >&2; exit 1; }
[ -f "$source_file.sha256" ] || { echo "Checksum not found: $source_file.sha256" >&2; exit 1; }

(cd "$resolved_backup_dir" && sha256sum -c "$BACKUP_FILE.sha256")
umask 077
cp "$source_file" "$resolved_export_dir/$BACKUP_FILE"
cp "$source_file.sha256" "$resolved_export_dir/$BACKUP_FILE.sha256"
