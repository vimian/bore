#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
test "$(git branch --show-current)" = master
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/master)"
git diff --quiet HEAD --
sh scripts/configure-postgres.sh
export BORE_RELEASE_REVISION="$(git rev-parse HEAD)"
docker compose --progress plain --env-file .env.production -f compose.control-plane.yml up -d --build --wait --wait-timeout 180 control-plane monitoring web database-backup
docker compose --env-file .env.production -f compose.control-plane.yml exec -T control-plane node apps/control-plane/dist/src/database/verify.js
printf 'Production deployed at revision %s\n' "$BORE_RELEASE_REVISION"
