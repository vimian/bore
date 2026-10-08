#!/bin/sh
set -eu
umask 077
export PGPASSWORD="$(cat "${BORE_BACKUP_PASSWORD_FILE:-/run/secrets/bore_postgres_password}")"
directory=${BORE_BACKUP_DIRECTORY:-/backups}
mkdir -p "$directory"
backup() {
  temporary=$(mktemp "$directory/bore-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX.tmp") || return 1
  target="${temporary%.tmp}.dump"
  # Explicit guards also work when this function runs inside the loop's if condition.
  if ! pg_dump --format=custom --no-owner --no-acl --file="$temporary" ||
     ! pg_restore --list "$temporary" > /dev/null; then
    rm -f "$temporary"
    return 1
  fi
  if ! mv "$temporary" "$target"; then return 1; fi
  if ! find "$directory" -maxdepth 1 -name 'bore-*.dump' -mtime +14 -delete; then return 1; fi
  printf 'PostgreSQL backup completed at %s\n' "$(date -u +%FT%TZ)"
}
if [ "${1:-once}" = loop ]; then
  while true; do
    if ! (backup); then printf 'PostgreSQL backup failed\n' >&2; fi
    sleep 86400 &
    wait "$!"
  done
else
  backup
fi
