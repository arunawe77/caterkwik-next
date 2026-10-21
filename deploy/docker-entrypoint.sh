#!/bin/sh
set -e

# Apply any migrations the release brings, then serve. If a migration fails the container
# stops here, so the previous release keeps running and a half-migrated site is never served.
npx prisma migrate deploy
exec npx next start -H 0.0.0.0 -p "${PORT:-3000}"
