#!/bin/sh
set -eu
BORE_APP_PASSWORD=$(cat /run/secrets/bore_postgres_password)
export BORE_APP_PASSWORD
psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv app_password BORE_APP_PASSWORD
CREATE ROLE bore LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER DATABASE bore OWNER TO bore;
SQL
unset BORE_APP_PASSWORD
