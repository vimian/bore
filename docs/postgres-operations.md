# PostgreSQL operations

Production uses PostgreSQL 18 in `compose.control-plane.yml`, pinned to a tested
minor release and image digest. The database has no published host port and is
attached only to an internal Docker network. Applications use the non-superuser
`bore` role; the bootstrap administrator has a separate password. Secrets live
under the private, ignored `.secrets/` directory and are mounted read-only into
the containers that need them. Never commit or print their contents.

## Storage and consistency

The dedicated `bore-postgres-data` named volume contains the cluster, with data
checksums enabled. PostgreSQL 18's volume mount is `/var/lib/postgresql`, not the
older image's `/var/lib/postgresql/data` location.

Identity, password hashes, sessions, small control metadata, and per-host traffic
history live in PostgreSQL. Runtime metadata uses a revisioned JSONB row; this is
not a complete relational redesign of the V1 namespace model. Traffic history
remains separate, so routing never loads all visitor IP counters. Control writes
lock the latest state row and commit atomically, without rewriting identity rows
or quotas. The control plane caches metadata, publishes changes only after commit,
and refreshes external metadata edits every five seconds. Dashboard history is
loaded only for the requesting owner. Database failures make readiness fail and
do not trigger a SQLite fallback.

Connection pools are bounded: ten per application process and four for the probe
worker. Connection/lock deadlines are five seconds and statements have a ten-second
deadline. The server allows sixty connections and uses 128 MB of shared buffers.
Web authentication derives the existing scrypt format asynchronously; imported
password hashes and salts remain unchanged. Existing cookies and CLI tokens retain
their IDs, signatures, and expiration times.

Monitoring is in the `monitoring` schema, with the existing fourteen-day retention.
Reports retain the same SSH command:

```sh
docker exec bore-control-plane node apps/control-plane/dist/src/monitoring/report.js 24
```

## Initial cutover

Do not start new PostgreSQL application writers before importing existing data.
Use a single reused SSH session. First commit, push, and fast-forward production
to the exact approved `origin/master` revision. Then run:

```sh
cd /srv/bore/repo
sh scripts/deploy-postgres-cutover.sh
```

The script verifies the branch/revision and tracked worktree, generates missing
secrets without printing them, builds application images, and initializes the
database before stopping the old application/web/monitoring writers. It then
runs the import with explicit approval, starts PostgreSQL-backed services, waits
for readiness, verifies authenticated reads and creates a PostgreSQL backup.
Active tunnels reconnect after the control plane
restarts. Initial cutover therefore has a short maintenance window.

The importer backs up both SQLite files with SQLite's backup API and checks
integrity. It migrates identities, credentials, sessions, namespace metadata,
traffic history, and monitoring tables in one PostgreSQL transaction. Every
table's row count and canonical content checksum must match before commit.
The marker in `migrations` stores these verification results, not credentials.
Subsequent deployments see the marker and never replay stale SQLite data over
live PostgreSQL. Initial import refuses missing sources or a populated unmarked
target. Fresh installations require explicit `BORE_ALLOW_EMPTY_DATABASE=yes`
approval; never use that to bypass a missing production database.

Original SQLite files and verified backups remain in `bore-control-plane-data`.
They are recovery artifacts only after cutover, not live databases. Do not remove
that volume: it may also contain existing certificate/runtime data.

For later PostgreSQL-compatible releases, use the usual master deployment flow:

```sh
docker compose --env-file .env.production -f compose.control-plane.yml up -d --build
```

Verify public HTTPS health, authenticated web/API reads, counts/ownership/quotas,
live tunnel behavior, new monitoring rows, and the published client manifest.
For an automated account/quota/namespace/readiness check:

```sh
docker exec bore-control-plane node apps/control-plane/dist/src/database/verify.js
```

This creates and removes one temporary session without changing existing accounts
or sessions. It checks an imported owner against both authenticated HTTP APIs and
verifies that the application database role is not an administrator.

## Backups and recovery

`bore-database-backup` creates a consistent custom-format `pg_dump` daily and
retains fourteen days in `bore-postgres-backups`. Dumps exclude ownership/ACLs
and are checked with `pg_restore --list` before atomic publication. Check the
container logs for failures; a list check is not a full restore test. Force a dump:

```sh
docker exec bore-database-backup sh /scripts/backup-postgres.sh once
docker logs --since 24h bore-database-backup
```

Restore-test a selected dump into a separate empty database using `pg_restore
--exit-on-error --single-transaction --no-owner --no-acl`, then verify the imported
row counts, sessions, and ownership before planning any live recovery. Never run
a destructive restore against the live database without a maintenance plan and
a fresh backup. Never use `docker compose down --volumes` on production.

These backups are on the same VPS. They cover application mistakes, not complete
host/disk loss; off-host encrypted replication must be configured separately.
Do not silently return to SQLite after new PostgreSQL writes: old files are stale.
Rollback to PostgreSQL-capable code where possible. Returning to older SQLite-only
code requires stopping writers and exporting current PostgreSQL application and
monitoring data, not restoring an old snapshot.

## Local development and tests

```sh
docker compose -f compose.postgres.dev.yml up -d
export DATABASE_URL=postgresql://bore:development-only@localhost:55439/bore
pnpm dev:server
```

Set the same URL in the web process. Integration tests require a separate,
disposable database and `TEST_DATABASE_URL`; never supply a production URL.
Migration tests create isolated databases to validate preservation, rollback,
approval gates, and idempotency. The complete suite, type checking and workspace
builds were run locally against real PostgreSQL before release. A CI template is
provided in `docs/postgres-tests.workflow.yml`; it is not active until moved to
`.github/workflows/tests.yml` using GitHub credentials with workflow permission.

Minor version upgrades require updating the pinned image/digest, exercising
tests and restore checks, and deploying through master. Major version upgrades
require an explicit `pg_upgrade` or dump/restore plan; changing the image tag
alone is not a valid upgrade procedure.
