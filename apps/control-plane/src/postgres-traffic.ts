import type { transaction } from "@bore/database";
import { incrementTrafficStats, type TrafficUpdate } from "./traffic-history.js";
import type { PersistedState, RequestStatsRecord } from "./types.js";

export type PostgreSQLClient = Parameters<Parameters<typeof transaction>[0]>[0];

// Every caller must lock app_state before locking history, including resets and releases.
export async function writeTraffic(client: PostgreSQLClient, state: PersistedState, entries: TrafficUpdate[]): Promise<boolean> {
  const grouped = new Map<string, { kind: string; id: string; stats?: RequestStatsRecord }>();
  let metadataChanged = false;
  for (const entry of entries) {
    const record = entry.kind === "direct" ? state.reservations[entry.id] : state.accessHosts[entry.id];
    if (!record) continue;
    const key = `${entry.kind}:${entry.id}`;
    let group = grouped.get(key);
    if (!group) {
      const { rows } = await client.query<{ value: RequestStatsRecord }>(
        "SELECT value FROM traffic_history WHERE kind=$1 AND id=$2 FOR UPDATE", [entry.kind, entry.id],
      );
      group = { kind: entry.kind, id: entry.id, stats: rows[0]?.value };
      grouped.set(key, group);
    }
    group.stats = incrementTrafficStats(group.stats, entry.ipAddress, entry);
    if (entry.kind === "child") {
      const host = state.accessHosts[entry.id]!;
      if (entry.lastAt > host.lastSeenAt) {
        host.lastSeenAt = entry.lastAt;
        host.updatedAt = entry.lastAt;
        metadataChanged = true;
      }
    }
  }
  for (const group of grouped.values()) {
    await client.query(
      `INSERT INTO traffic_history (kind,id,value) VALUES ($1,$2,$3::jsonb)
       ON CONFLICT (kind,id) DO UPDATE SET value=EXCLUDED.value`,
      [group.kind, group.id, JSON.stringify(group.stats)],
    );
  }
  return metadataChanged;
}

export async function pruneTraffic(client: PostgreSQLClient): Promise<void> {
  await client.query(`DELETE FROM traffic_history WHERE
    (kind='direct' AND NOT EXISTS (SELECT 1 FROM app_state,
      jsonb_object_keys(value->'reservations') AS item(id) WHERE key='primary' AND item.id=traffic_history.id)) OR
    (kind='child' AND NOT EXISTS (SELECT 1 FROM app_state,
      jsonb_object_keys(value->'accessHosts') AS item(id) WHERE key='primary' AND item.id=traffic_history.id))`);
}
