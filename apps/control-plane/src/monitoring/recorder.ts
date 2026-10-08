import type { ServerResponse } from "node:http";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { RequestAggregate } from "./storage.js";
import { createMonitoringStorage, type DeviceAggregate, type MonitoringBatch, type MonitoringStorage, type Sample } from "./adapter.js";
import { UsageBuffer, type UsageTarget } from "./usage.js";

export const DURATION_BUCKETS = [50, 100, 250, 500, 1000, 3000, 10000, 30000, Infinity];

export class RequestTrace {
  #started = performance.now();
  #routed?: number;
  #sent?: number;
  #received?: number;
  #done = false;
  outcome = "completed";
  bytes = 0;
  localMs?: number;

  constructor(private readonly record: (duration: number, routing: number, relay: number, status: number, outcome: string, bytes: number, localMs?: number) => void) {}
  routed(): void { this.#routed = performance.now(); }
  sent(): void { this.#sent = performance.now(); }
  received(): void { this.#received = performance.now(); }
  finish(status: number): void {
    if (this.#done) return;
    this.#done = true;
    this.record(performance.now() - this.#started, (this.#routed ?? performance.now()) - this.#started,
      this.#sent === undefined ? 0 : (this.#received ?? performance.now()) - this.#sent,
      status, this.outcome, this.bytes, this.localMs);
  }
}

export class TunnelMonitoring {
  readonly storage: MonitoringStorage;
  #rows = new Map<string, RequestAggregate>();
  #loop = monitorEventLoopDelay({ resolution: 20 });
  #cpu = process.cpuUsage();
  #lastSample = performance.now();
  #lastPrune = 0;
  #timer?: NodeJS.Timeout;
  #active = 0;
  #dropped = 0;
  #devices = new Map<string, DeviceAggregate>();
  #samples: Sample[] = [];
  #pending?: MonitoringBatch;
  #flushing?: Promise<void>;
  #sampling = false;
  #sampleTask?: Promise<void>;
  #closing = false;
  #usage = new UsageBuffer();
  #writerId = randomUUID();
  #sequence = 0;

  constructor(dbPath: string, private readonly options: { databaseUrl?: string; storage?: MonitoringStorage; resolveTarget?: (host: string) => UsageTarget | undefined; platformHost?: string } = { databaseUrl: process.env.DATABASE_URL }) {
    this.storage = options.storage ?? createMonitoringStorage(
      process.env.BORE_MONITORING_DB_PATH ?? join(dirname(dbPath), "monitoring.sqlite"), options.databaseUrl);
  }

  get db(): DatabaseSync {
    if (!this.storage.db) throw new Error("Direct SQLite access requires fixture mode and an awaited flush");
    return this.storage.db;
  }

  start(gauges: () => Record<string, number>): void {
    this.#loop.enable();
    this.#timer = setInterval(() => {
      if (!this.#sampling) this.#sampleTask = this.sample(gauges);
    }, 15_000);
    this.#timer.unref();
  }

  private async sample(gauges: () => Record<string, number>): Promise<void> {
    if (this.#sampling || this.#closing) return;
    this.#sampling = true;
    try {
      const now = performance.now();
      const cpu = process.cpuUsage();
      const cpuPercent = ((cpu.user + cpu.system - this.#cpu.user - this.#cpu.system) / 1000) / (now - this.#lastSample) * 100;
      const memory = process.memoryUsage();
      const data = { ...memory, cpuPercent, eventLoopP99Ms: this.#loop.percentile(99) / 1e6,
        eventLoopMaxMs: this.#loop.max / 1e6, activeRequests: this.#active, droppedMetrics: this.#dropped, droppedUsage: this.#usage.dropped, ...gauges() };
      if (this.#samples.length < 240) this.#samples.push({ time: Date.now(), source: "control-plane", data });
      else this.#dropped += 1;
      if (data.eventLoopP99Ms > 500 || memory.heapUsed > 1024 ** 3) {
        console.warn(JSON.stringify({ event: "bore_bottleneck", ...data }));
      }
      this.#cpu = cpu;
      this.#lastSample = now;
      this.#loop.reset();
      await this.flush();
      if (Date.now() - this.#lastPrune > 3600_000) {
        await this.storage.prune();
        this.#lastPrune = Date.now();
      }
    } catch (error) { console.error("Monitoring persistence failed; pending batch retained", error); }
    finally { this.#sampling = false; }
  }

  trace(host: string, protocol: string, synthetic = false): RequestTrace {
    const target = this.options.resolveTarget?.(host);
    const metricProtocol = synthetic ? `probe:${protocol}` : protocol;
    const day = new Date().toISOString().slice(0, 10);
    this.#usage.record(target, synthetic, false, day);
    const metricHost = this.options.resolveTarget && !target && host !== this.options.platformHost ? "__unattributed__" : host;
    this.#active += 1;
    return new RequestTrace((duration, routing, relay, status, outcome, bytes, localMs) => {
      this.#active -= 1;
      if (protocol === "websocket" && status === 101 && !synthetic) this.#usage.record(target, false, true);
      const minute = Math.floor(Date.now() / 60_000) * 60_000;
      const safeHost = metricHost.slice(0, 253);
      const key = JSON.stringify([minute, safeHost, metricProtocol, outcome, status]);
      let row = this.#rows.get(key);
      if (!row) {
        if (this.#rows.size >= 2048) { this.#dropped += 1; return; }
        row = { minute, host: safeHost, protocol: metricProtocol, outcome, status, count: 0, totalMs: 0, maxMs: 0, routingMs: 0, relayMs: 0, bytes: 0, localMs: 0, localCount: 0, histogram: DURATION_BUCKETS.map(() => 0) };
        this.#rows.set(key, row);
      }
      row.count += 1;
      row.totalMs += duration;
      row.maxMs = Math.max(row.maxMs, duration);
      row.routingMs += routing;
      row.relayMs += relay;
      row.bytes += bytes;
      if (localMs !== undefined && Number.isFinite(localMs) && localMs >= 0 && localMs <= 60_000) {
        row.localMs += localMs;
        row.localCount += 1;
      }
      const bucket = DURATION_BUCKETS.findIndex((limit) => duration <= limit);
      row.histogram[bucket] = (row.histogram[bucket] ?? 0) + 1;
    });
  }

  http(host: string, response: ServerResponse, protocol = "http", synthetic = false): RequestTrace {
    const trace = this.trace(host, protocol, synthetic);
    response.once("finish", () => trace.finish(response.statusCode));
    response.once("close", () => {
      if (!response.writableFinished) { trace.outcome = "client_aborted"; trace.finish(499); }
    });
    return trace;
  }

  flush(): Promise<void> {
    if (this.#flushing) return this.#flushing;
    if (!this.#pending) {
      this.#pending = { requests: [...this.#rows.values()], devices: [...this.#devices.values()], samples: this.#samples,
        usage: this.#usage.drain(), delivery: { writerId: this.#writerId, sequence: ++this.#sequence } };
      this.#rows = new Map();
      this.#devices = new Map();
      this.#samples = [];
    }
    const batch = this.#pending;
    this.#flushing = Promise.resolve().then(() => this.storage.saveBatch(batch)).then(() => {
      this.#pending = undefined;
    }).finally(() => { this.#flushing = undefined; });
    return this.#flushing;
  }

  deviceEvent(deviceId: string, event: string, code = 0): void {
    const minute = Math.floor(Date.now() / 60_000) * 60_000;
    const key = `${minute}:${deviceId}:${event}:${code}`;
    const prior = this.#devices.get(key);
    if (prior) prior.count += 1;
    else if (this.#devices.size < 2048) this.#devices.set(key, { minute, deviceId, event, code, count: 1 });
    else this.#dropped += 1;
  }

  async close(): Promise<void> {
    this.#closing = true;
    if (this.#timer) clearInterval(this.#timer);
    this.#loop.disable();
    await this.#sampleTask;
    await this.flush();
    if (this.#rows.size || this.#devices.size || this.#samples.length || this.#usage.size) await this.flush();
    await this.storage.close();
  }
}
