#!/bin/sh
# Nightly competitor price check. Asks the app to start a background run; the app answers at once.
#   0 3 * * *  cd /opt/caterkwick/caterkwik-next && ./deploy/competitor-check.sh
set -eu
SECRET="$(grep '^CRON_SECRET=' .env | cut -d= -f2-)"
[ -n "$SECRET" ] || { echo "competitor-check: CRON_SECRET is not set in .env" >&2; exit 1; }
curl -fsS -X POST -H "Authorization: Bearer $SECRET" http://127.0.0.1:3000/api/cron/competitor-prices
echo
