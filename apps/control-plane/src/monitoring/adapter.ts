import type { DatabaseSync } from "node:sqlite";
import type { RequestAggregate } from "./storage.js";
import { PostgresMonitoringStorage } from "./postgres.js";
import type { UsageRow } from "./usage.js";

export interface DeviceAggregate { minute: number; deviceId: string; event: string; code: number; count: number }
export interface Sample { time: number; source: string; data: unknown }
export interface ProbeRow { time: number; host: string; status: number; durationMs: number; error: unknown }
export interface MonitoringBatch { requests: RequestAggregate[]; devices: DeviceAggregate[]; samples: Sample[]; usage?: UsageRow[]; delivery?: { writerId: string; sequence: number } }
export interface MonitoringStorage {
  readonly db?: DatabaseSync;
  saveBatch(batch: MonitoringBatch): Promise<void>;
  saveProbe(row: ProbeRow): Promise<void>;
  prune(now?: number): Promise<void>;
  close(): Promise<void>;
}

class LazySQLiteMonitoringStorage implements MonitoringStorage {
  #loaded?: MonitoringStorage;
  #ready?: Promise<MonitoringStorage>;
  constructor(private readonly path: string) {}
  get db(): DatabaseSync | undefined { return this.#loaded?.db; }
  private load(): Promise<MonitoringStorage> {
    this.#ready ??= import("./sqlite-adapter.js").then(({ SQLiteMonitoringStorage }) => {
      this.#loaded = new SQLiteMonitoringStorage(this.path);
      return this.#loaded;
    }).catch((error: unknown) => { this.#ready = undefined; throw error; });
    return this.#ready;
  }
  async saveBatch(batch: MonitoringBatch): Promise<void> {
    await (await this.load()).saveBatch(batch);
  }
  async saveProbe(row: ProbeRow): Promise<void> {
    await (await this.load()).saveProbe(row);
  }
  async prune(now = Date.now()): Promise<void> { await (await this.load()).prune(now); }
  async close(): Promise<void> { if (this.#ready) await (await this.#ready).close(); }
}

export function createMonitoringStorage(path: string, databaseUrl: string | undefined): MonitoringStorage {
  return databaseUrl ? new PostgresMonitoringStorage() : new LazySQLiteMonitoringStorage(path);
}
