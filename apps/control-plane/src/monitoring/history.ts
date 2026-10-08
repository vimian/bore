import { query, transaction } from "@bore/database";

// Only bounded, numeric diagnostics are archived; no URLs, IPs or embedded probe lists.
const resourceMetrics = ["rss", "heapTotal", "heapUsed", "external", "arrayBuffers", "cpuPercent",
  "eventLoopP99Ms", "eventLoopMaxMs", "activeRequests", "droppedMetrics", "droppedUsage", "pendingRelays",
  "pendingWebSockets", "activeWebSockets", "deviceSockets", "bufferedBytes", "trafficDropped",
  "maxDeviceRttMs", "load1", "load5", "memoryTotal", "memoryAvailable", "swapUsed", "stateBytes",
  "namespaces", "activeNamespaces", "deviceConnections"];

const sources = [
  { table: "requests", time: "minute", category: "requests",
    dimensions: "jsonb_build_object('host',host,'protocol',protocol,'outcome',outcome,'status',status)",
    metrics: `jsonb_build_object('count',count,'total_ms',total_ms,'max_ms',max_ms,'routing_ms',routing_ms,
      'relay_ms',relay_ms,'bytes',bytes,'local_ms',local_ms,'local_count',local_count) ||
      (SELECT jsonb_object_agg('bucket_'||(ordinality-1),value) FROM jsonb_array_elements(histogram) WITH ORDINALITY)` },
  { table: "probes", time: "time", category: "probes",
    dimensions: "jsonb_build_object('host',host,'status',status,'error',COALESCE(error->>'error',''),'expectedConnected',COALESCE(error->'expectedConnected','false'::jsonb))",
    metrics: "jsonb_build_object('duration_ms',duration_ms,'dns_ms',error->'dnsMs','connect_ms',error->'connectMs','tls_ms',error->'tlsMs','first_byte_ms',error->'firstByteMs')" },
  { table: "samples", time: "time", category: "runtime",
    dimensions: "jsonb_build_object('source',source)", metrics: "data" },
  { table: "device_events", time: "minute", category: "devices",
    dimensions: "jsonb_build_object('deviceId',device_id,'event',event,'code',code)", metrics: "jsonb_build_object('count',count)" },
];

function flattened(source: typeof sources[number], table: string, filter: string): string {
  const whitelist = source.category === "runtime" ? `AND m.key=ANY(ARRAY[${resourceMetrics.map((v) => `'${v}'`).join(",")}])` : "";
  return `SELECT to_char(to_timestamp(${source.time}/1000.0) AT TIME ZONE 'UTC','YYYY-MM-DD') AS day,
    revision,'${source.category}' AS category,${source.dimensions} AS dimensions,m.key AS metric,
    (m.value::text)::double precision AS value FROM ${table}
    CROSS JOIN LATERAL jsonb_each(${source.metrics}) m WHERE ${filter} AND jsonb_typeof(m.value)='number' ${whitelist}`;
}

export async function compactHistory(cutoff: number): Promise<void> {
  await transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(1919092028)");
    for (const source of sources) {
      // Archival and deletion commit together. A retry or a second compactor cannot double-count.
      await client.query(`WITH removed AS (DELETE FROM monitoring.${source.table} WHERE ${source.time}<$1 RETURNING *),
        flat AS (${flattened(source, "removed", "TRUE")})
        INSERT INTO monitoring.daily_metrics AS d
        SELECT day,revision,category,dimensions,metric,SUM(value),MIN(value),MAX(value),COUNT(*) FROM flat
        GROUP BY day,revision,category,dimensions,metric
        ON CONFLICT(day,revision,category,dimensions,metric) DO UPDATE SET
          total=d.total+excluded.total,minimum=LEAST(d.minimum,excluded.minimum),
          maximum=GREATEST(d.maximum,excluded.maximum),observations=d.observations+excluded.observations`, [cutoff]);
    }
  });
}

export async function historyRows(from: string, to: string, host?: string): Promise<Record<string, unknown>[]> {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`) + 86400_000;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || !Number.isFinite(start) || !Number.isFinite(end)
    || new Date(start).toISOString().slice(0, 10) !== from || new Date(end - 86400_000).toISOString().slice(0, 10) !== to || end <= start) {
    throw new Error("Specify real UTC dates FROM TO, with TO >= FROM");
  }
  // One statement sees a consistent snapshot of both tiers during compaction.
  const raw = sources.map((source) => flattened(source, `monitoring.${source.table}`, `${source.time}>=$1 AND ${source.time}<$2`)).join(" UNION ALL ");
  return (await query(`WITH raw AS (${raw}), combined AS (
    SELECT day,revision,category,dimensions,metric,SUM(value) AS total,MIN(value) AS minimum,MAX(value) AS maximum,COUNT(*) AS observations
    FROM raw GROUP BY day,revision,category,dimensions,metric
    UNION ALL SELECT day,revision,category,dimensions,metric,total,minimum,maximum,observations
    FROM monitoring.daily_metrics WHERE day>=$3 AND day<=$4)
    SELECT day,revision,category,dimensions,metric,SUM(total) AS total,MIN(minimum) AS minimum,MAX(maximum) AS maximum,SUM(observations)::bigint AS observations
    FROM combined WHERE ($5::text IS NULL OR dimensions->>'host'=$5 OR category='runtime')
    GROUP BY day,revision,category,dimensions,metric ORDER BY day,revision,category,dimensions,metric`, [start, end, from, to, host ?? null])).rows;
}
