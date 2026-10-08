import { ensureSchema, query, transaction } from "@bore/database";
import type { MonitoringBatch, MonitoringStorage, ProbeRow } from "./adapter.js";

export class PostgresMonitoringStorage implements MonitoringStorage {
  #ready?: Promise<void>;
  private initialize(): Promise<void> {
    this.#ready ??= ensureSchema().catch((error: unknown) => { this.#ready = undefined; throw error; });
    return this.#ready;
  }

  async saveBatch(batch: MonitoringBatch): Promise<void> {
    await this.initialize();
    await transaction(async (client) => {
      for (const row of batch.requests) {
        await client.query(`INSERT INTO monitoring.requests
          (minute,host,protocol,outcome,status,count,total_ms,max_ms,routing_ms,relay_ms,bytes,histogram,local_ms,local_count)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14)
          ON CONFLICT (minute,host,protocol,outcome,status) DO UPDATE SET
          count=requests.count+excluded.count, total_ms=requests.total_ms+excluded.total_ms,
          max_ms=GREATEST(requests.max_ms,excluded.max_ms), routing_ms=requests.routing_ms+excluded.routing_ms,
          relay_ms=requests.relay_ms+excluded.relay_ms, bytes=requests.bytes+excluded.bytes,
          histogram=(SELECT jsonb_agg((a.value::bigint+b.value::bigint) ORDER BY a.ordinality)
            FROM jsonb_array_elements_text(requests.histogram) WITH ORDINALITY a(value,ordinality)
            JOIN jsonb_array_elements_text(excluded.histogram) WITH ORDINALITY b(value,ordinality) USING (ordinality)),
          local_ms=requests.local_ms+excluded.local_ms, local_count=requests.local_count+excluded.local_count`,
        [row.minute, row.host, row.protocol, row.outcome, row.status, row.count, row.totalMs, row.maxMs,
          row.routingMs, row.relayMs, row.bytes, JSON.stringify(row.histogram), row.localMs, row.localCount]);
      }
      for (const row of batch.devices) {
        await client.query(`INSERT INTO monitoring.device_events (minute,device_id,event,code,count)
          VALUES ($1,$2,$3,$4,$5) ON CONFLICT (minute,device_id,event,code)
          DO UPDATE SET count=device_events.count+excluded.count`, [row.minute, row.deviceId, row.event, row.code, row.count]);
      }
      for (const row of batch.samples) {
        await client.query(`INSERT INTO monitoring.samples (time,source,data) VALUES ($1,$2,$3::jsonb)
          ON CONFLICT (time,source) DO UPDATE SET data=excluded.data`, [row.time, row.source, JSON.stringify(row.data)]);
      }
    });
  }

  async saveProbe(row: ProbeRow): Promise<void> {
    await this.initialize();
    await query(`INSERT INTO monitoring.probes (time,host,status,duration_ms,error) VALUES ($1,$2,$3,$4,$5::jsonb)
      ON CONFLICT (time,host) DO UPDATE SET status=excluded.status,duration_ms=excluded.duration_ms,error=excluded.error`,
    [row.time, row.host, row.status, row.durationMs, JSON.stringify(row.error)]);
  }

  async prune(now = Date.now()): Promise<void> {
    await this.initialize();
    const cutoff = now - 14 * 86400_000;
    await transaction(async (client) => {
      for (const [table, column] of [["requests", "minute"], ["samples", "time"], ["probes", "time"], ["device_events", "minute"]]) {
        await client.query(`DELETE FROM monitoring.${table} WHERE ${column} < $1`, [cutoff]);
      }
    });
  }

  // The shared pool also serves application state; its lifecycle belongs to the process.
  async close(): Promise<void> {}
}
