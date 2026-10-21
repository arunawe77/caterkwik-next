#!/bin/sh
# Copies every product image the catalogue links to onto the media storage and points the catalogue at the copies.
# Safe to repeat: what is already stored is skipped. Runs in a throwaway container with this release's scripts.
set -eu
cd "$(dirname "$0")/.."
DB_PASSWORD=$(grep '^DB_PASSWORD=' .env | cut -d= -f2-)
docker compose up -d db
for script in migrate-media mirror-images; do
  docker compose run --rm --no-deps \
    -v "$(pwd)/scripts:/app/scripts:ro" -v "$(pwd)/public:/app/public:ro" \
    -e DATABASE_URL="postgresql://caterkwik:${DB_PASSWORD}@db:5432/caterkwik" \
    --entrypoint node app "scripts/${script}.mjs" --rewrite-db
done
# The site holds the catalogue in memory from startup, so restart it to show the relinked images.
docker compose restart app
