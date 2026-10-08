import type { SQLInputValue } from "node:sqlite";
import { ensureSchema, query } from "@bore/database";

type Row = Record<string, unknown>;
const buckets = [50, 100, 250, 500, 1000, 3000, 10000, 30000, Infinity];

export async function buildMonitoringReport(hours: number, host?: string,
  options: { databaseUrl?: string; sqlitePath?: string } = { databaseUrl: process.env.DATABASE_URL }): Promise<Row> {
  if (!Number.isFinite(hours) || hours <= 0 || hours > 336) throw new Error("Hours must be between 0 and 336");
  const pg = Boolean(options.databaseUrl);
  const db = pg ? undefined : new (await import("node:sqlite")).DatabaseSync(
    options.sqlitePath ?? process.env.BORE_MONITORING_DB_PATH ?? "/data/monitoring.sqlite", { readOnly: true });
  const all = async (sql: string, params: SQLInputValue[]): Promise<Row[]> => {
    if (db) return db.prepare(sql).all(...params);
    return (await query<Row>(sql, params)).rows;
  };
  const table = (name: string) => pg ? `monitoring.${name}` : name;
  const arg = (index: number) => pg ? `$${index}` : "?";
  const rounded = (sql: string) => pg ? `ROUND((${sql})::numeric,1)::double precision` : `ROUND(${sql},1)`;
  const sum = (column: string) => pg ? `SUM(${column})::bigint` : `SUM(${column})`;
  const json = (column: string, key: string) => pg ? `(${column}->>'${key}')::double precision` : `json_extract(${column},'$.${key}')`;
  const cutoff = Date.now() - hours * 3600_000;
  const params: SQLInputValue[] = host ? [cutoff, host] : [cutoff];
  const filter = host ? ` AND host=${arg(2)}` : "";
  try {
    if (pg) await ensureSchema();
    const requests = await all(`SELECT host,protocol,outcome,status,${sum("count")} AS count,
      ${rounded("SUM(total_ms)/SUM(count)")} AS "avgMs", ${rounded("MAX(max_ms)")} AS "maxMs",
      ${rounded("SUM(routing_ms)/SUM(count)")} AS "avgRoutingMs", ${rounded("SUM(relay_ms)/SUM(count)")} AS "avgRelayMs",
      ${rounded("SUM(local_ms)/NULLIF(SUM(local_count),0)")} AS "avgLocalMs", ${sum("local_count")} AS "localTimingCount",
      ${sum("bytes")} AS bytes FROM ${table("requests")} WHERE minute>=${arg(1)} ${filter}
      GROUP BY host,protocol,outcome,status ORDER BY count DESC`, params);
    const histograms = await all(`SELECT host,histogram FROM ${table("requests")} WHERE minute>=${arg(1)} ${filter}`, params);
    const byHost = new Map<string, number[]>();
    for (const row of histograms) {
      const hostname = String(row.host);
      const histogram = byHost.get(hostname) ?? buckets.map(() => 0);
      const counts = typeof row.histogram === "string" ? JSON.parse(row.histogram) as number[] : row.histogram as number[];
      counts.forEach((count, index) => { histogram[index] = (histogram[index] ?? 0) + count; });
      byHost.set(hostname, histogram);
    }
    const latencyP95 = [...byHost].map(([hostname, histogram]) => {
      const target = histogram.reduce((sum, count) => sum + count, 0) * 0.95;
      let accumulated = 0;
      const index = histogram.findIndex((count) => { accumulated += count; return accumulated >= target; });
      const bound = buckets[index] ?? Infinity;
      return { host: hostname, p95UpperBoundMs: Number.isFinite(bound) ? bound : ">30000" };
    });
    const probes = await all(`SELECT host,status,COUNT(*) AS count,${rounded("AVG(duration_ms)")} AS "avgMs",
      ${rounded("MAX(duration_ms)")} AS "maxMs" FROM ${table("probes")} WHERE time>=${arg(1)} ${filter}
      GROUP BY host,status ORDER BY host,status`, params);
    const samples = await all(`SELECT source,MIN(time) AS "firstTime",MAX(time) AS "lastTime",COUNT(*) AS count
      FROM ${table("samples")} WHERE time>=${arg(1)} GROUP BY source`, [cutoff]);
    const runtime = (await all(`SELECT ${rounded(`AVG(${json("data", "cpuPercent")})`)} AS "avgCpuPercent",
      ${rounded(`MAX(${json("data", "cpuPercent")})`)} AS "maxCpuPercent",
      MAX(${json("data", "rss")}) AS "maxRss",MAX(${json("data", "heapUsed")}) AS "maxHeapUsed",
      ${rounded(`MAX(${json("data", "eventLoopP99Ms")})`)} AS "maxEventLoopP99Ms",
      MAX(${json("data", "pendingRelays")}) AS "maxPendingRelays",
      ${rounded(`MAX(${json("data", "maxDeviceRttMs")})`)} AS "maxDeviceRttMs",
      MAX(${json("data", "trafficDropped")}) AS "trafficDropped"
      FROM ${table("samples")} WHERE time>=${arg(1)} AND source='control-plane'`, [cutoff]))[0];
    const hostResources = (await all(`SELECT MAX(${json("data", "load1")}) AS "maxLoad1",
      MIN(${json("data", "memoryAvailable")}) AS "minMemoryAvailable",
      MAX(${json("data", "swapUsed")}) AS "maxSwapUsed",MAX(${json("data", "stateBytes")}) AS "maxStateBytes"
      FROM ${table("samples")} WHERE time>=${arg(1)} AND source='host'`, [cutoff]))[0];
    const expected = pg ? "(error->>'expectedConnected')::boolean=true" : "json_extract(error,'$.expectedConnected')=1";
    const recentProbeFailures = await all(`SELECT host,time,error FROM ${table("probes")}
      WHERE time>=${arg(1)} ${filter} AND (status=0 OR status>=500) AND ${expected} ORDER BY time DESC LIMIT 20`, params);
    const deviceEvents = await all(`SELECT device_id AS "deviceId",event,code,${sum("count")} AS count
      FROM ${table("device_events")} WHERE minute>=${arg(1)} GROUP BY device_id,event,code ORDER BY count DESC`, [cutoff]);
    return { hours, host, samples, runtime, hostResources, latencyP95, requests, probes, deviceEvents, recentProbeFailures };
  } finally { db?.close(); }
}
