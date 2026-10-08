import type { DatabaseSync } from "node:sqlite";

interface TrafficState {
  reservations: Record<string, { id: string; userId: string; directRequestStats?: unknown }>;
  accessHosts: Record<string, { id: string; userId: string; requestStats?: unknown }>;
}

export function hydrateUserTraffic(db: DatabaseSync, state: TrafficState, userId: string): void {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE name='traffic_history' AND type='table'").get();
  if (!exists) return;
  const ids = [
    ...Object.values(state.reservations).filter((item) => item.userId === userId).map((item) => item.id),
    ...Object.values(state.accessHosts).filter((item) => item.userId === userId).map((item) => item.id),
  ];
  if (!ids.length) return;
  const rows = db.prepare(`SELECT kind,id,value FROM traffic_history WHERE id IN (${ids.map(() => "?").join(",")})`)
    .all(...ids) as Array<{ kind: string; id: string; value: string }>;
  for (const row of rows) {
    if (row.kind === "direct" && state.reservations[row.id]) state.reservations[row.id]!.directRequestStats = JSON.parse(row.value);
    if (row.kind === "child" && state.accessHosts[row.id]) state.accessHosts[row.id]!.requestStats = JSON.parse(row.value);
  }
}
