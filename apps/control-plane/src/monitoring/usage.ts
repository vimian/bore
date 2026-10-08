import type { QueryClient } from "@bore/database";

export interface UsageTarget { userId: string; reservationId: string; accessHostId: string; namespace: string; host: string }
export interface UsageRow extends UsageTarget { day: string; httpRequests: number; websocketConnections: number; syntheticRequests: number }

export class UsageBuffer {
  #rows = new Map<string, UsageRow>();
  dropped = 0;
  record(target: UsageTarget | undefined, synthetic: boolean, websocket = false, day = new Date().toISOString().slice(0, 10)): void {
    if (!target) return;
    const key = JSON.stringify([day, target.userId, target.reservationId, target.accessHostId]);
    let row = this.#rows.get(key);
    if (!row) {
      if (this.#rows.size >= 4096) { this.dropped += 1; return; }
      row = { ...target, day, httpRequests: 0, websocketConnections: 0, syntheticRequests: 0 };
      this.#rows.set(key, row);
    }
    if (websocket) row.websocketConnections += 1;
    else if (synthetic) row.syntheticRequests += 1;
    else row.httpRequests += 1;
  }
  drain(): UsageRow[] { const rows = [...this.#rows.values()]; this.#rows.clear(); return rows; }
  get size(): number { return this.#rows.size; }
}

export async function acceptDelivery(client: QueryClient, delivery?: { writerId: string; sequence: number }): Promise<boolean> {
  if (!delivery) return true;
  await client.query("INSERT INTO monitoring.writers(id) VALUES ($1) ON CONFLICT DO NOTHING", [delivery.writerId]);
  const { rows } = await client.query<{ sequence: number }>("SELECT sequence FROM monitoring.writers WHERE id=$1 FOR UPDATE", [delivery.writerId]);
  if (delivery.sequence <= rows[0]!.sequence) return false;
  if (delivery.sequence !== rows[0]!.sequence + 1) throw new Error("Out-of-order monitoring delivery");
  await client.query("UPDATE monitoring.writers SET sequence=$2,updated_at=NOW() WHERE id=$1", [delivery.writerId, delivery.sequence]);
  return true;
}

export async function saveUsage(client: QueryClient, rows: UsageRow[]): Promise<void> {
  if (!rows.length) return;
  // One statement expands each leaf into daily, monthly and lifetime totals. No per-request writes.
  await client.query(`INSERT INTO monitoring.usage_counts AS u
    SELECT period.granularity,period.period,r.user_id,r.reservation_id,r.access_host_id,r.namespace,r.host,
      SUM(r.http_requests),SUM(r.websocket_connections),0,SUM(r.synthetic_requests)
    FROM jsonb_to_recordset($1::jsonb) AS r(day TEXT,user_id TEXT,reservation_id TEXT,access_host_id TEXT,
      namespace TEXT,host TEXT,http_requests BIGINT,websocket_connections BIGINT,synthetic_requests BIGINT)
    CROSS JOIN LATERAL (VALUES ('daily',r.day),('monthly',LEFT(r.day,7)),('lifetime','*')) period(granularity,period)
    GROUP BY period.granularity,period.period,r.user_id,r.reservation_id,r.access_host_id,r.namespace,r.host
    ON CONFLICT(granularity,period,user_id,reservation_id,access_host_id) DO UPDATE SET
      namespace=excluded.namespace,host=excluded.host,http_requests=u.http_requests+excluded.http_requests,
      websocket_connections=u.websocket_connections+excluded.websocket_connections,
      synthetic_requests=u.synthetic_requests+excluded.synthetic_requests`, [JSON.stringify(rows.map((r) => ({
        day: r.day, user_id: r.userId, reservation_id: r.reservationId, access_host_id: r.accessHostId,
        namespace: r.namespace, host: r.host, http_requests: r.httpRequests,
        websocket_connections: r.websocketConnections, synthetic_requests: r.syntheticRequests,
      })))]);
}
