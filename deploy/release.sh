#!/bin/sh
# Ships what is checked out to this server, and rolls back if it does not come up healthy.
# Run on the server by the deploy workflow, or by hand:
#
#   cd /opt/caterkwik && git pull && ./deploy/release.sh
set -e

cd "$(dirname "$0")/.."
PREVIOUS=$(docker compose images -q app 2>/dev/null | head -n1 || true)

docker compose up -d --build

# Wait for the app, and its database, to answer.
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:3000/api/health?db=1" >/dev/null 2>&1; then
    echo "release healthy"
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 3
done

echo "release did not become healthy; recent logs:" >&2
docker compose logs --tail 40 app >&2
if [ -n "$PREVIOUS" ]; then
  echo "rolling back to $PREVIOUS" >&2
  docker tag "$PREVIOUS" caterkwik-app:rollback
  docker compose up -d --no-build app
fi
exit 1
