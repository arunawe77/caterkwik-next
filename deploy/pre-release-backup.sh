#!/bin/sh
# A dated database dump before every release, so a bad migration can be undone. Keeps the newest 14.
set -eu
cd "$(dirname "$0")/.."
DIR="${BACKUP_DIR:-$(dirname "$(pwd)")/backups}"
mkdir -p "$DIR"
FILE="$DIR/pre-release-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose exec -T db pg_dump -U caterkwik caterkwik | gzip > "$FILE"
if [ ! -s "$FILE" ]; then rm -f "$FILE"; echo "database backup came out empty; stopping before the release" >&2; exit 1; fi
ls -1t "$DIR"/pre-release-*.sql.gz | tail -n +15 | xargs -r rm -f
echo "backup: $FILE"
