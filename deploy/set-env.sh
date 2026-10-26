#!/bin/sh
# Reads KEY=VALUE lines on stdin and sets each in .env, replacing any earlier line for the key.
# Used by the deploy to put GitHub secrets in the server's .env without them appearing in a command line or log.
set -eu
touch .env
chmod 600 .env
while IFS= read -r line; do
  key="${line%%=*}"
  case "$key" in ''|*[!A-Za-z0-9_]*) echo "set-env: bad key" >&2; exit 1;; esac
  grep -v "^${key}=" .env > .env.tmp || true
  printf '%s\n' "$line" >> .env.tmp
  mv .env.tmp .env
done
