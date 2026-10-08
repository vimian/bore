import type { DatabaseSync } from "node:sqlite";
import type { PersistedState, RequestStatsRecord } from "./types.js";
import type { TrafficEntry } from "./traffic-batcher.js";

export interface TrafficUpdate extends TrafficEntry { kind: "direct" | "child"; id: string }

export function incrementTrafficStats(stats: RequestStatsRecord | undefined, ipAddress: string, entry: TrafficEntry): RequestStatsRecord {
  const result = stats ?? { requestCount: 0, firstRequestAt: entry.firstAt, lastRequestAt: entry.lastAt, ipAddresses: {} };
  result.requestCount += entry.count;
  result.lastRequestAt = entry.lastAt;
  const existing = result.ipAddresses[ipAddress];
  result.ipAddresses[ipAddress] = { ipAddress, requestCount: (existing?.requestCount ?? 0) + entry.count,
    firstSeenAt: existing?.firstSeenAt ?? entry.firstAt, lastSeenAt: entry.lastAt };
  return result;
}

export function initializeTrafficHistory(db: DatabaseSync): void {
  db.exec("CREATE TABLE IF NOT EXISTS traffic_history (kind TEXT, id TEXT, value TEXT NOT NULL, PRIMARY KEY (kind,id))");
  // Legacy inline history is moved in one transaction; ownership and counts are preserved.
  const row = db.prepare("SELECT value FROM app_state WHERE key='primary'").get() as { value: string } | undefined;
  if (!row) return;
  const state = JSON.parse(row.value) as PersistedState;
  const hasInline = Object.values(state.reservations ?? {}).some((item) => item.directRequestStats !== undefined) ||
    Object.values(state.accessHosts ?? {}).some((item) => item.requestStats !== undefined);
  if (!hasInline) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    // Re-read after obtaining the write lock so a concurrent writer cannot be lost.
    const current = db.prepare("SELECT value FROM app_state WHERE key='primary'").get() as { value: string };
    const latest = JSON.parse(current.value) as PersistedState;
    persistTrafficHistory(db, latest, true);
    db.prepare("UPDATE app_state SET value=?,updated_at=? WHERE key='primary'")
      .run(JSON.stringify(withoutTrafficHistory(latest)), new Date().toISOString());
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

export function withoutTrafficHistory<T extends { reservations: PersistedState["reservations"]; accessHosts: PersistedState["accessHosts"] }>(state: T): T {
  return { ...state,
    reservations: Object.fromEntries(Object.entries(state.reservations ?? {}).map(([id, { directRequestStats: _stats, ...metadata }]) => [id, metadata])),
    accessHosts: Object.fromEntries(Object.entries(state.accessHosts ?? {}).map(([id, { requestStats: _stats, ...metadata }]) => [id, metadata])),
  };
}

export function hydrateTrafficHistory(db: DatabaseSync, state: PersistedState, userId?: string): void {
  const ids = userId === undefined ? undefined : [
    ...Object.values(state.reservations).filter((item) => item.userId === userId).map((item) => item.id),
    ...Object.values(state.accessHosts).filter((item) => item.userId === userId).map((item) => item.id),
  ];
  if (ids?.length === 0) return;
  const rows = db.prepare(`SELECT kind,id,value FROM traffic_history${ids ? ` WHERE id IN (${ids.map(() => "?").join(",")})` : ""}`)
    .all(...(ids ?? [])) as Array<{ kind: string; id: string; value: string }>;
  for (const row of rows) {
    if (row.kind === "direct" && state.reservations[row.id]) state.reservations[row.id]!.directRequestStats = JSON.parse(row.value);
    if (row.kind === "child" && state.accessHosts[row.id]) state.accessHosts[row.id]!.requestStats = JSON.parse(row.value);
  }
}

export function persistTrafficHistory(db: DatabaseSync, state: PersistedState, preserve: boolean): void {
  const write = db.prepare("INSERT OR REPLACE INTO traffic_history VALUES (?,?,?)");
  const remove = db.prepare("DELETE FROM traffic_history WHERE kind=? AND id=?");
  for (const [kind, records] of [["direct", state.reservations], ["child", state.accessHosts]] as const) {
    for (const item of Object.values(records)) {
      const stats = "subdomain" in item ? item.directRequestStats : item.requestStats;
      if (stats) write.run(kind, item.id, JSON.stringify(stats));
      else if (!preserve) remove.run(kind, item.id);
    }
  }
}

export function pruneOrphanTraffic(db: DatabaseSync): void {
  for (const [kind, field] of [["direct", "reservations"], ["child", "accessHosts"]]) {
    db.prepare(`DELETE FROM traffic_history WHERE kind=? AND id NOT IN
      (SELECT key FROM json_each((SELECT value FROM app_state WHERE key='primary'),'$.${field}'))`).run(kind!);
  }
}

export function recordTrafficUpdates(db: DatabaseSync, entries: TrafficUpdate[]): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    const stateRow = db.prepare("SELECT value FROM app_state WHERE key='primary'").get() as { value: string };
    const state = JSON.parse(stateRow.value) as PersistedState;
    let touchedChild = false;
    const grouped = new Map<string, { kind: string; id: string; stats: RequestStatsRecord | undefined }>();
    for (const entry of entries) {
      const exists = entry.kind === "direct" ? state.reservations[entry.id] : state.accessHosts[entry.id];
      if (!exists) continue;
      if (entry.kind === "child") {
        state.accessHosts[entry.id]!.lastSeenAt = entry.lastAt;
        state.accessHosts[entry.id]!.updatedAt = entry.lastAt;
        touchedChild = true;
      }
      const key = `${entry.kind}:${entry.id}`;
      let item = grouped.get(key);
      if (!item) {
        const row = db.prepare("SELECT value FROM traffic_history WHERE kind=? AND id=?").get(entry.kind, entry.id) as { value: string } | undefined;
        item = { kind: entry.kind, id: entry.id, stats: row ? JSON.parse(row.value) : undefined };
        grouped.set(key, item);
      }
      item.stats = incrementTrafficStats(item.stats, entry.ipAddress, entry);
    }
    const write = db.prepare("INSERT OR REPLACE INTO traffic_history VALUES (?,?,?)");
    for (const item of grouped.values()) write.run(item.kind, item.id, JSON.stringify(item.stats));
    if (touchedChild) db.prepare("UPDATE app_state SET value=?,updated_at=? WHERE key='primary'")
      .run(JSON.stringify(state), new Date().toISOString());
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
