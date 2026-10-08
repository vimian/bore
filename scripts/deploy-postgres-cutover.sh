#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
test "$(git branch --show-current)" = master
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/master)"
git diff --quiet HEAD --
sh scripts/configure-postgres.sh
export BORE_RELEASE_REVISION="$(git rev-parse HEAD)"
compose() { docker compose --progress plain --env-file .env.production -f compose.control-plane.yml "$@"; }
# Build and initialize PostgreSQL before interrupting existing SQLite writers.
compose build control-plane monitoring web
compose up -d --wait postgres
compose stop control-plane web monitoring
if ! compose run --rm -e BORE_SQLITE_MIGRATION_APPROVED=yes database-migrate; then
  printf 'Import failed. Writers remain stopped and SQLite backups/originals are intact. Do not start fresh databases.\n' >&2
  exit 1
fi
compose up -d --wait --wait-timeout 120 control-plane monitoring web database-backup
compose exec -T control-plane node apps/control-plane/dist/src/database/verify.js
compose exec -T database-backup sh /scripts/backup-postgres.sh once
printf 'PostgreSQL cutover completed at revision %s\n' "$(git rev-parse HEAD)"
