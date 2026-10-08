import { ensureSchema, query, transaction } from "@bore/database";
import type { MonitoringBatch, MonitoringStorage, ProbeRow } from "./adapter.js";
import { acceptDelivery, saveUsage } from "./usage.js";
import { compactHistory } from "./history.js";

const revision = process.env.BORE_RELEASE_REVISION ?? "unversioned";

export class PostgresMonitoringStorage implements MonitoringStorage {
  #ready?: Promise<void>;
  private initialize(): Promise<void> {
    this.#ready ??= ensureSchema().then(async () => {
      await query("INSERT INTO monitoring.releases(revision) VALUES ($1) ON CONFLICT DO NOTHING", [revision]);
    }).catch((error: unknown) => { this.#ready = undefined; throw error; });
    return this.#ready;
  }

  async saveBatch(batch: MonitoringBatch): Promise<void> {
    await this.initialize();
    await transaction(async (client) => {
      if (!await acceptDelivery(client, batch.delivery)) return;
      await saveUsage(client, batch.usage ?? []);
      for (const row of batch.requests) {
        await client.query(`INSERT INTO monitoring.requests
          (minute,host,protocol,outcome,status,count,total_ms,max_ms,routing_ms,relay_ms,bytes,histogram,local_ms,local_count,revision)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15)
          ON CONFLICT (minute,host,protocol,outcome,status) DO UPDATE SET
          count=requests.count+excluded.count, total_ms=requests.total_ms+excluded.total_ms,
          max_ms=GREATEST(requests.max_ms,excluded.max_ms), routing_ms=requests.routing_ms+excluded.routing_ms,
          relay_ms=requests.relay_ms+excluded.relay_ms, bytes=requests.bytes+excluded.bytes,
          histogram=(SELECT jsonb_agg((a.value::bigint+b.value::bigint) ORDER BY a.ordinality)
            FROM jsonb_array_elements_text(requests.histogram) WITH ORDINALITY a(value,ordinality)
            JOIN jsonb_array_elements_text(excluded.histogram) WITH ORDINALITY b(value,ordinality) USING (ordinality)),
          local_ms=requests.local_ms+excluded.local_ms, local_count=requests.local_count+excluded.local_count,
          revision=CASE WHEN requests.revision=excluded.revision THEN requests.revision ELSE 'mixed' END`,
        [row.minute, row.host, row.protocol, row.outcome, row.status, row.count, row.totalMs, row.maxMs,
          row.routingMs, row.relayMs, row.bytes, JSON.stringify(row.histogram), row.localMs, row.localCount, revision]);
      }
      for (const row of batch.devices) {
        await client.query(`INSERT INTO monitoring.device_events (minute,device_id,event,code,count,revision)
          VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (minute,device_id,event,code)
          DO UPDATE SET count=device_events.count+excluded.count,
          revision=CASE WHEN device_events.revision=excluded.revision THEN device_events.revision ELSE 'mixed' END`, [row.minute, row.deviceId, row.event, row.code, row.count, revision]);
      }
      for (const row of batch.samples) {
        await client.query(`INSERT INTO monitoring.samples (time,source,data,revision) VALUES ($1,$2,$3::jsonb,$4)
          ON CONFLICT (time,source) DO UPDATE SET data=excluded.data,revision=excluded.revision`, [row.time, row.source, JSON.stringify(row.data), revision]);
      }
    });
  }

  async saveProbe(row: ProbeRow): Promise<void> {
    await this.initialize();
    await query(`INSERT INTO monitoring.probes (time,host,status,duration_ms,error,revision) VALUES ($1,$2,$3,$4,$5::jsonb,$6)
      ON CONFLICT (time,host) DO UPDATE SET status=excluded.status,duration_ms=excluded.duration_ms,error=excluded.error,revision=excluded.revision`,
    [row.time, row.host, row.status, row.durationMs, JSON.stringify(row.error), revision]);
  }

  async prune(now = Date.now()): Promise<void> {
    await this.initialize();
    await compactHistory(now - 14 * 86400_000);
  }

  // The shared pool also serves application state; its lifecycle belongs to the process.
  async close(): Promise<void> {}
}
