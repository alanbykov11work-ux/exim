#!/bin/sh
set -eu

interval="${BACKUP_INTERVAL_SECONDS:-86400}"
case "$interval" in
  ''|*[!0-9]*) echo "BACKUP_INTERVAL_SECONDS must be an integer" >&2; exit 1 ;;
esac
[ "$interval" -ge 3600 ] || { echo "BACKUP_INTERVAL_SECONDS must be at least 3600" >&2; exit 1; }

while true; do
  /bin/sh /scripts/backup.sh
  sleep "$interval"
done
