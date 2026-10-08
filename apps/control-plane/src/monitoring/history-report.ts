import { closeDatabase, ensureSchema, query } from "@bore/database";
import { historyRows } from "./history.js";

try {
  await ensureSchema();
  const from = process.argv[2] ?? new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const to = process.argv[3] ?? new Date().toISOString().slice(0, 10);
  const rows = await historyRows(from, to, process.argv[4]);
  const groups = new Map<string, Record<string, any>>();
  for (const row of rows) {
    const key = JSON.stringify([row.day, row.revision, row.category, row.dimensions]);
    const group = groups.get(key) ?? { day: row.day, revision: row.revision, category: row.category, dimensions: row.dimensions, metrics: {} };
    group.metrics[String(row.metric)] = { total: row.total, min: row.minimum, max: row.maximum, samples: row.observations };
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const m = group.metrics;
    if (group.category === "requests") {
      group.requests = m.count?.total ?? 0;
      group.avgMs = (m.total_ms?.total ?? 0) / (group.requests || 1);
      group.maxMs = m.max_ms?.max ?? 0;
      group.avgRoutingMs = (m.routing_ms?.total ?? 0) / (group.requests || 1);
      group.avgRelayMs = (m.relay_ms?.total ?? 0) / (group.requests || 1);
      group.avgLocalMs = m.local_count?.total ? m.local_ms.total / m.local_count.total : null;
      const bounds = [50, 100, 250, 500, 1000, 3000, 10000, 30000, ">30000"];
      let cumulative = 0;
      group.p95UpperBoundMs = bounds.find((_, i) => { cumulative += m[`bucket_${i}`]?.total ?? 0; return cumulative >= group.requests * 0.95; }) ?? null;
    }
    if (group.category === "runtime" || group.category === "probes") {
      for (const metric of Object.values(m) as Array<Record<string, number>>) metric.avg = metric.total! / metric.samples!;
    }
  }
  console.log(JSON.stringify({ from, to, timeZone: "UTC", granularity: "daily", releases: (await query("SELECT * FROM monitoring.releases ORDER BY first_seen")).rows, history: [...groups.values()] }, null, 2));
} finally { await closeDatabase(); }
