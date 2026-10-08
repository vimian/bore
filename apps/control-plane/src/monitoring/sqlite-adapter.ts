import type { DatabaseSync } from "node:sqlite";
import { openMonitoringDb, saveRequests, pruneMonitoring } from "./storage.js";
import type { MonitoringBatch, MonitoringStorage, ProbeRow } from "./adapter.js";

export class SQLiteMonitoringStorage implements MonitoringStorage {
  readonly db: DatabaseSync;
  constructor(path: string) { this.db = openMonitoringDb(path); }
  async saveBatch(batch: MonitoringBatch): Promise<void> {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      saveRequests(this.db, batch.requests, true);
      const device = this.db.prepare(`INSERT INTO device_events VALUES (?,?,?,?,?)
        ON CONFLICT (minute,device_id,event,code) DO UPDATE SET count=count+excluded.count`);
      for (const row of batch.devices) device.run(row.minute, row.deviceId, row.event, row.code, row.count);
      const sample = this.db.prepare("INSERT OR REPLACE INTO samples VALUES (?,?,?)");
      for (const row of batch.samples) sample.run(row.time, row.source, JSON.stringify(row.data));
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  async saveProbe(row: ProbeRow): Promise<void> {
    this.db.prepare("INSERT OR REPLACE INTO probes VALUES (?,?,?,?,?)")
      .run(row.time, row.host, row.status, row.durationMs, JSON.stringify(row.error));
  }
  async prune(now = Date.now()): Promise<void> { pruneMonitoring(this.db, now); }
  async close(): Promise<void> { this.db.close(); }
}
