import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface RequestAggregate {
  minute: number;
  host: string;
  protocol: string;
  outcome: string;
  status: number;
  count: number;
  totalMs: number;
  maxMs: number;
  routingMs: number;
  relayMs: number;
  bytes: number;
  localMs: number;
  localCount: number;
  histogram: number[];
}

export function openMonitoringDb(path: string): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 2000;
    CREATE TABLE IF NOT EXISTS requests (
      minute INTEGER, host TEXT, protocol TEXT, outcome TEXT, status INTEGER,
      count INTEGER, total_ms REAL, max_ms REAL, routing_ms REAL, relay_ms REAL,
      bytes INTEGER, histogram TEXT, local_ms REAL, local_count INTEGER,
      PRIMARY KEY (minute, host, protocol, outcome, status)
    );
    CREATE TABLE IF NOT EXISTS samples (
      time INTEGER, source TEXT, data TEXT, PRIMARY KEY (time, source)
    );
    CREATE TABLE IF NOT EXISTS probes (
      time INTEGER, host TEXT, status INTEGER, duration_ms REAL, error TEXT,
      PRIMARY KEY (time, host)
    );
    CREATE TABLE IF NOT EXISTS device_events (
      minute INTEGER, device_id TEXT, event TEXT, code INTEGER, count INTEGER,
      PRIMARY KEY (minute, device_id, event, code)
    );
  `);
  return db;
}

export function saveRequests(db: DatabaseSync, rows: RequestAggregate[], inTransaction = false): void {
  const find = db.prepare("SELECT histogram FROM requests WHERE minute=? AND host=? AND protocol=? AND outcome=? AND status=?");
  const write = db.prepare(`INSERT INTO requests VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (minute, host, protocol, outcome, status) DO UPDATE SET
    count=count+excluded.count, total_ms=total_ms+excluded.total_ms,
    max_ms=MAX(max_ms,excluded.max_ms), routing_ms=routing_ms+excluded.routing_ms,
    relay_ms=relay_ms+excluded.relay_ms, bytes=bytes+excluded.bytes,
    histogram=excluded.histogram, local_ms=local_ms+excluded.local_ms, local_count=local_count+excluded.local_count`);
  if (!inTransaction) db.exec("BEGIN IMMEDIATE");
  try {
    for (const row of rows) {
      const key = [row.minute, row.host, row.protocol, row.outcome, row.status];
      const prior = find.get(...key) as { histogram: string } | undefined;
      const histogram: number[] = prior ? JSON.parse(prior.histogram) : row.histogram.map(() => 0);
      row.histogram.forEach((count, index) => { histogram[index] = (histogram[index] ?? 0) + count; });
      write.run(...key, row.count, row.totalMs, row.maxMs, row.routingMs, row.relayMs, row.bytes, JSON.stringify(histogram), row.localMs, row.localCount);
    }
    if (!inTransaction) db.exec("COMMIT");
  } catch (error) {
    if (!inTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

export function saveSample(db: DatabaseSync, source: string, data: unknown): void {
  db.prepare("INSERT OR REPLACE INTO samples VALUES (?, ?, ?)").run(Date.now(), source, JSON.stringify(data));
}

export function pruneMonitoring(db: DatabaseSync, now = Date.now()): void {
  const cutoff = now - 14 * 86400_000;
  for (const [table, column] of [["requests", "minute"], ["samples", "time"], ["probes", "time"], ["device_events", "minute"]]) {
    db.exec(`DELETE FROM ${table} WHERE ${column} < ${cutoff}`);
  }
}
