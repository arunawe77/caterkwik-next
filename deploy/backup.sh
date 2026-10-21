#!/bin/sh
# Nightly database backup, kept for 14 days. Orders and accounts live only in Postgres.
#
#   0 2 * * *  cd /opt/caterkwik && ./deploy/backup.sh
set -e

DIR="${BACKUP_DIR:-/var/backups/caterkwik}"
mkdir -p "$DIR"
docker compose exec -T db pg_dump -U caterkwik caterkwik | gzip > "$DIR/caterkwik-$(date +%F).sql.gz"
find "$DIR" -name 'caterkwik-*.sql.gz' -mtime +14 -delete
echo "backup written to $DIR"
