import { DatabaseSync } from "node:sqlite";

const hours = Number(process.argv[2] ?? "24");
if (!Number.isFinite(hours) || hours <= 0 || hours > 336) throw new Error("Hours must be between 0 and 336");
const host = process.argv[3];
const buckets = [50, 100, 250, 500, 1000, 3000, 10000, 30000, Infinity];
const db = new DatabaseSync(process.env.BORE_MONITORING_DB_PATH ?? "/data/monitoring.sqlite", { readOnly: true });
const cutoff = Date.now() - hours * 3600_000;
const params = host ? [cutoff, host] : [cutoff];
const filter = host ? " AND host=?" : "";
const requests = db.prepare(`SELECT host, protocol, outcome, status, SUM(count) AS count,
  ROUND(SUM(total_ms)/SUM(count),1) AS avgMs, ROUND(MAX(max_ms),1) AS maxMs,
  ROUND(SUM(routing_ms)/SUM(count),1) AS avgRoutingMs, ROUND(SUM(relay_ms)/SUM(count),1) AS avgRelayMs,
  ROUND(SUM(local_ms)/NULLIF(SUM(local_count),0),1) AS avgLocalMs, SUM(local_count) AS localTimingCount,
  SUM(bytes) AS bytes FROM requests WHERE minute>=? ${filter}
  GROUP BY host, protocol, outcome, status ORDER BY count DESC`).all(...params);
const histograms = db.prepare(`SELECT host, histogram FROM requests WHERE minute>=? ${filter}`).all(...params) as Array<{ host: string; histogram: string }>;
const byHost = new Map<string, number[]>();
for (const row of histograms) {
  const histogram = byHost.get(row.host) ?? buckets.map(() => 0);
  (JSON.parse(row.histogram) as number[]).forEach((count, index) => { histogram[index] = (histogram[index] ?? 0) + count; });
  byHost.set(row.host, histogram);
}
const latencyP95 = [...byHost].map(([host, histogram]) => {
  const target = histogram.reduce((sum, count) => sum + count, 0) * 0.95;
  let accumulated = 0;
  const index = histogram.findIndex((count) => { accumulated += count; return accumulated >= target; });
  const bound = buckets[index] ?? Infinity;
  return { host, p95UpperBoundMs: Number.isFinite(bound) ? bound : ">30000" };
});
const probes = db.prepare(`SELECT host, status, COUNT(*) AS count, ROUND(AVG(duration_ms),1) AS avgMs,
  ROUND(MAX(duration_ms),1) AS maxMs FROM probes WHERE time>=? ${filter} GROUP BY host,status ORDER BY host,status`).all(...params);
const samples = db.prepare("SELECT source, MIN(time) AS firstTime, MAX(time) AS lastTime, COUNT(*) AS count FROM samples WHERE time>=? GROUP BY source").all(cutoff);
const runtime = db.prepare(`SELECT ROUND(AVG(json_extract(data,'$.cpuPercent')),1) AS avgCpuPercent,
  ROUND(MAX(json_extract(data,'$.cpuPercent')),1) AS maxCpuPercent,
  MAX(json_extract(data,'$.rss')) AS maxRss, MAX(json_extract(data,'$.heapUsed')) AS maxHeapUsed,
  ROUND(MAX(json_extract(data,'$.eventLoopP99Ms')),1) AS maxEventLoopP99Ms,
  MAX(json_extract(data,'$.pendingRelays')) AS maxPendingRelays,
  ROUND(MAX(json_extract(data,'$.maxDeviceRttMs')),1) AS maxDeviceRttMs,
  MAX(json_extract(data,'$.trafficDropped')) AS trafficDropped
  FROM samples WHERE time>=? AND source='control-plane'`).get(cutoff);
const hostResources = db.prepare(`SELECT MAX(json_extract(data,'$.load1')) AS maxLoad1,
  MIN(json_extract(data,'$.memoryAvailable')) AS minMemoryAvailable,
  MAX(json_extract(data,'$.swapUsed')) AS maxSwapUsed,
  MAX(json_extract(data,'$.stateBytes')) AS maxStateBytes
  FROM samples WHERE time>=? AND source='host'`).get(cutoff);
const recentProbeFailures = db.prepare(`SELECT host, time, error FROM probes
  WHERE time>=? ${filter} AND (status=0 OR status>=500)
  AND json_extract(error,'$.expectedConnected')=1 ORDER BY time DESC LIMIT 20`).all(...params);
console.log(JSON.stringify({ hours, host, samples, runtime, hostResources, latencyP95, requests, probes, recentProbeFailures }, null, 2));
db.close();
