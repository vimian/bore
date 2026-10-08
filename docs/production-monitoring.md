# Production monitoring

Bore records tunnel outcomes and latency separately from its dashboard traffic
counters. Monitoring runs continuously after `docker compose --env-file
.env.production -f compose.control-plane.yml up -d --build`.

## Data and retention

- Production monitoring uses the shared PostgreSQL database configured by
  `DATABASE_URL`. Its `monitoring` schema contains `requests`, `samples`,
  `probes`, and `device_events`; PostgreSQL's persistent Docker volume survives
  application container recreation. Histograms, sample data, and probe details
  are JSONB; bucket timestamps and counters are integers.
- The production migration imports existing `/data/monitoring.sqlite` history
  along with application data. Keep the verified SQLite backup until migration
  checks and the recovery window are complete. SQLite remains an explicit
  fixture adapter, not the default development database. Server startup requires
  `DATABASE_URL`, or an explicit `BORE_DB_PATH` for SQLite fixtures. Production
  processes must all have `DATABASE_URL` configured and must not silently fall
  back.
- HTTP requests and WebSocket upgrades are aggregated by minute, hostname,
  protocol, status, and outcome. Histograms contain latency buckets; reports
  give approximate p95 upper bounds, not exact percentiles.
- Recorded stages include routing time, relay time, response size, and, when
  supplied by an updated agent, local application duration.
- Known control API routes have separate fixed labels. Device connection,
  replacement, and close-code counts are retained per device and minute,
  so reconnect loops can be distinguished from slow application responses.
- Every 15 seconds the control plane records memory, CPU, event-loop delay,
  pending relay requests, WebSocket counts, queued bytes, maximum device ping
  round-trip time, and dropped traffic/metric counters.
- An independent `bore-monitoring` container probes `/health` and the root of
  every registered root and child hostname every minute. It uses HEAD for
  namespace applications, verifies TLS, follows no redirects, applies a
  ten-second wall-clock deadline, and limits concurrency to four probes.
  DNS, TCP, TLS, and first-response timings are cumulative from probe start.
- The independent process also records host load, available memory, swap,
  application-state size, and whether each hostname has a recently seen
  connected claimant. An offline development machine is distinguished from a
  failing hostname whose agent is expected to be online.
- Request aggregates, runtime samples, and probes are kept for 14 days, with
  hourly pruning. Monitoring logs rotate at 10 MB with three files.
- Monitoring records hostnames and failure categories, not request URLs,
  query strings, cookies, authorization headers, bodies, email addresses, or
  visitor IP addresses. Existing dashboard IP counters remain separate.
- No monitoring endpoint is publicly exposed. Read reports over SSH with
  server administration access.

## Investigate an incident

Use a single SSH session and execute commands sequentially. For the last hour:

```sh
docker exec bore-control-plane node apps/control-plane/dist/src/monitoring/report.js 1
```

For a specific hostname over the last day:

```sh
docker exec bore-control-plane node apps/control-plane/dist/src/monitoring/report.js 24 eva.bore.dk
docker logs --since 1h --tail 100 bore-monitoring
docker stats --no-stream
```

The report provides average/max routing and relay durations, local timing
coverage, approximate p95 latency, failures, independent probe results, and
runtime resource peaks. Supply fractional hours for short observations, e.g.
`0.25` for fifteen minutes. Query the database directly for precise time
windows and individual runtime/probe samples.

Interpretation:

- High routing time and event-loop delay with high CPU/heap indicate a server
  bottleneck. Independent health probe timeouts also identify complete stalls
  or restart windows where in-process instrumentation cannot run.
- `not_connected` means no live tunnel claimant. A reserved namespace is not
  a running tunnel. Inspect the agent's desired ports and local listener.
- `transport_unavailable`, relay timeouts, high device ping RTT, or queued bytes
  suggest a failed or congested agent connection.
- `local_timeout` / `local_request_failed` and high local durations from updated
  clients point to the local server. Old clients remain compatible and classify
  failed local responses as `upstream_error`; their local timings are absent.
- An application response of 401/403/404/405 can be a valid result of a root
  HEAD probe. These probes test reachability, not the application's login or
  a complete browser workflow.
- Active-host probe failures or responses taking over three seconds emit
  `bore_probe_alert`. Event-loop p99 over 500 ms or heap over 1 GiB emits
  `bore_bottleneck`. These alerts are recorded locally; delivery to an external
  notification channel must be configured separately.

## Request-path safeguards

Dashboard traffic counters are buffered and written once every five seconds
instead of rewriting the full application state before every request. Pending
traffic keys are capped at 4096; excess or failed-persistence counts are
reported as `trafficDropped`.

Monitoring persistence is asynchronous and transactional. Only one batch can
be in flight; concurrent flush calls await the same promise. A failed batch
keeps its original minute buckets, histograms, counters, device events, and
samples for retry, while new events enter a separate bounded buffer. Each of
the two buffers holds at most 2048 request keys, 2048 device-event keys, and
240 runtime samples. Existing unpersisted aggregates are never discarded on
write failure. New keys or samples beyond the buffer budget increment
`droppedMetrics`. Shutdown awaits pending writes and drains the newer buffer;
the process owner then closes the shared PostgreSQL pool. A crash or forced
termination can still lose any metrics not yet committed, particularly during
a database outage; this is not a disk-backed queue.

Routing uses a cached copy without traffic history. PostgreSQL state readers
use the shared revisioned state; monitoring does not own or update routing
metadata. Administrative writes should be verified after updates.

Authentication reads the user row directly instead of loading all traffic
history. Fresh database snapshots need no additional deep clone, and snapshot
writes avoid an unused reload. Traefik reconciliation retains only the latest
requested routing configuration, omits traffic statistics, and skips unchanged
configuration files. Frequent agent syncs therefore cannot build a queue of
full traffic snapshots waiting for filesystem writes.

Dashboard history is stored in indexed `traffic_history` rows in the application
database, rather than inside the shared routing-state JSON. Existing inline
counters migrate atomically on control-plane startup. Metadata updates preserve
these rows; released hosts lose their history, and explicit counter resets affect
only the selected hostname. PostgreSQL snapshots contain metadata only;
`userSnapshot` explicitly hydrates traffic statistics for the selected user's
dashboard. Do not use the general snapshot API to inspect traffic counters.

Pending HTTP relays and WebSocket handshakes are capped at 128. HTTP request
bodies are capped at 16 MiB, and HTTP relays reject a transport queue over
32 MiB. Overload returns 503. Aborted requests release pending slots. Device
connections are checked with ping/pong every thirty seconds. Docker's init
process reaps orphaned health-check children, and health checks have an
explicit two-second fetch deadline.

Updated agents serialize relay connection attempts and ignore stale relay
teardown, preventing concurrent sync/reconnect calls from replacing each other's
connections. Local WebSocket handshakes run outside the relay reader, so one slow
local handshake cannot block unrelated HTTP dispatch or ping/pong handling.
Pending local handshakes are capped at 128 and canceled when their connection or
relay closes. Existing installed agents need `bore self-update` and a restart to
receive these client fixes and supply local-application timing data.

## Rollback

Redeploy the preceding committed master revision using the usual GitHub release
flow. The monitoring database can remain in the persistent volume. Application
identity and namespace ownership are unchanged. Back up PostgreSQL before
production changes; do not restore a full database merely to roll back monitoring
code. A PostgreSQL-capable preceding revision can reuse the schema. Do not
deploy a SQLite-only revision or unset `DATABASE_URL` after PostgreSQL cutover:
the old SQLite files no longer reflect live account and namespace changes.
Returning to SQLite requires stopping writers and explicitly exporting current
PostgreSQL application and monitoring data, not restoring an old backup.

## Adapter checks

Run focused fixture and persistence tests through pnpm:

```sh
pnpm --filter @bore/control-plane exec node --test --import tsx test/monitoring-adapter.test.ts test/observability.test.ts
TEST_DATABASE_URL=postgresql://bore:test-password@127.0.0.1:55439/bore_test pnpm --filter @bore/control-plane exec node --test --import tsx test/monitoring-postgres.test.ts
```

The PostgreSQL integration test skips unless `TEST_DATABASE_URL` is supplied.
Use only an isolated test database: it creates the shared schema and exercises
retention pruning. It validates concurrent histogram accumulation, transaction
rollback, JSONB storage, integer timestamps/counters, report output, and probes.
Explicit `{ databaseUrl: undefined }` selects the SQLite fixture adapter even
when the surrounding process has a production `DATABASE_URL` configured.
