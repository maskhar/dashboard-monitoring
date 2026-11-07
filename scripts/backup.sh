#!/bin/sh
set -eu
interval="${BACKUP_INTERVAL_SECONDS:-86400}"
retention="${BACKUP_RETENTION_DAYS:-14}"
mkdir -p /backups
while true; do
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  temporary="/backups/.${stamp}"
  mkdir -p "$temporary"
  pg_dump --format=custom --file="$temporary/database.dump"
  tar -czf "$temporary/uploads.tar.gz" -C /uploads .
  (cd "$temporary" && sha256sum database.dump uploads.tar.gz > SHA256SUMS && sha256sum -c SHA256SUMS)
  mv "$temporary" "/backups/$stamp"
  find /backups -mindepth 1 -maxdepth 1 -type d -mtime "+$retention" -exec rm -rf {} \;
  date +%s > /tmp/backup-healthy
  sleep "$interval"
done
