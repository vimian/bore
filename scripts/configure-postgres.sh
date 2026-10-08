#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
test ! -L .secrets
mkdir -p .secrets
chmod 700 .secrets
for name in postgres-password postgres-admin-password monitoring-probe-secret; do
  path=".secrets/$name"
  test ! -L "$path"
  if [ ! -e "$path" ]; then
    (umask 077; openssl rand -hex 32 > "$path")
  fi
  test -s "$path"
  # The host directory is private; mounted secret files must be readable by container users.
  chmod 644 "$path"
done
printf 'Database and monitoring secrets are configured; no credentials were printed.\n'
