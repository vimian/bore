# Production monitoring

Bore records tunnel outcomes and latency separately from its dashboard traffic
counters. Monitoring runs continuously after `docker compose --env-file
.env.production -f compose.control-plane.yml up -d --build`.

## Data and retention

- `/data/monitoring.sqlite` is a separate SQLite database in the existing
  persistent data volume. It survives container recreation and deployment.
- HTTP requests and WebSocket upgrades are aggregated by minute, hostname,
  protocol, status, and outcome. Histograms contain latency buckets; reports
  give approximate p95 upper bounds, not exact percentiles.
- Recorded stages include routing time, relay time, response size, and, when
  supplied by an updated agent, local application duration.
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
reported as `trafficDropped`. A crash can lose the most recent five seconds
of dashboard counters and fifteen seconds of request aggregates.

Routing uses a cached copy without traffic history, refreshed when application
state or an external SQLite writer changes. Local state updates are serialized
so concurrent requests cannot retain many stale snapshots or overwrite each
other. This does not provide transactional concurrency across separate
processes performing snapshot writes; account administration should still
verify persistence after updates.

Pending HTTP relays and WebSocket handshakes are capped at 128. HTTP request
bodies are capped at 16 MiB, and HTTP relays reject a transport queue over
32 MiB. Overload returns 503. Aborted requests release pending slots. Device
connections are checked with ping/pong every thirty seconds. Docker's init
process reaps orphaned health-check children, and health checks have an
explicit two-second fetch deadline.

## Rollback

Redeploy the preceding committed master revision using the usual GitHub release
flow. The monitoring database can remain in the persistent volume. Application
identity, namespace ownership, and traffic history require no schema migration
for this release. Back up the application database before production changes;
do not restore a full database merely to roll back monitoring code.
