import type { ServerResponse } from "node:http";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { join, dirname } from "node:path";
import { openMonitoringDb, pruneMonitoring, saveRequests, saveSample, type RequestAggregate } from "./storage.js";

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
  readonly db;
  #rows = new Map<string, RequestAggregate>();
  #loop = monitorEventLoopDelay({ resolution: 20 });
  #cpu = process.cpuUsage();
  #lastSample = performance.now();
  #lastPrune = 0;
  #timer?: NodeJS.Timeout;
  #active = 0;
  #dropped = 0;
  #devices = new Map<string, { minute: number; deviceId: string; event: string; code: number; count: number }>();

  constructor(dbPath: string) {
    this.db = openMonitoringDb(process.env.BORE_MONITORING_DB_PATH ?? join(dirname(dbPath), "monitoring.sqlite"));
  }

  start(gauges: () => Record<string, number>): void {
    this.#loop.enable();
    this.#timer = setInterval(() => {
      try {
        this.flush();
        const now = performance.now();
        const cpu = process.cpuUsage();
        const cpuPercent = ((cpu.user + cpu.system - this.#cpu.user - this.#cpu.system) / 1000) / (now - this.#lastSample) * 100;
        const memory = process.memoryUsage();
        const data = { ...memory, cpuPercent, eventLoopP99Ms: this.#loop.percentile(99) / 1e6,
          eventLoopMaxMs: this.#loop.max / 1e6, activeRequests: this.#active, droppedMetrics: this.#dropped, ...gauges() };
        saveSample(this.db, "control-plane", data);
        if (data.eventLoopP99Ms > 500 || memory.heapUsed > 1024 ** 3) {
          console.warn(JSON.stringify({ event: "bore_bottleneck", ...data }));
        }
        this.#cpu = cpu;
        this.#lastSample = now;
        this.#loop.reset();
        if (Date.now() - this.#lastPrune > 3600_000) {
          pruneMonitoring(this.db);
          this.#lastPrune = Date.now();
        }
      } catch (error) { console.error("Monitoring persistence failed", error); }
    }, 15_000);
    this.#timer.unref();
  }

  trace(host: string, protocol: string): RequestTrace {
    this.#active += 1;
    return new RequestTrace((duration, routing, relay, status, outcome, bytes, localMs) => {
      this.#active -= 1;
      const minute = Math.floor(Date.now() / 60_000) * 60_000;
      const safeHost = host.slice(0, 253);
      const key = JSON.stringify([minute, safeHost, protocol, outcome, status]);
      let row = this.#rows.get(key);
      if (!row) {
        if (this.#rows.size >= 2048) { this.#dropped += 1; return; }
        row = { minute, host: safeHost, protocol, outcome, status, count: 0, totalMs: 0, maxMs: 0, routingMs: 0, relayMs: 0, bytes: 0, localMs: 0, localCount: 0, histogram: DURATION_BUCKETS.map(() => 0) };
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

  http(host: string, response: ServerResponse, protocol = "http"): RequestTrace {
    const trace = this.trace(host, protocol);
    response.once("finish", () => trace.finish(response.statusCode));
    response.once("close", () => {
      if (!response.writableFinished) { trace.outcome = "client_aborted"; trace.finish(499); }
    });
    return trace;
  }

  flush(): void {
    saveRequests(this.db, [...this.#rows.values()]);
    this.#rows.clear();
    const write = this.db.prepare(`INSERT INTO device_events VALUES (?,?,?,?,?)
      ON CONFLICT (minute,device_id,event,code) DO UPDATE SET count=count+excluded.count`);
    for (const entry of this.#devices.values()) write.run(entry.minute, entry.deviceId, entry.event, entry.code, entry.count);
    this.#devices.clear();
  }

  deviceEvent(deviceId: string, event: string, code = 0): void {
    const minute = Math.floor(Date.now() / 60_000) * 60_000;
    const key = `${minute}:${deviceId}:${event}:${code}`;
    const prior = this.#devices.get(key);
    if (prior) prior.count += 1;
    else if (this.#devices.size < 2048) this.#devices.set(key, { minute, deviceId, event, code, count: 1 });
    else this.#dropped += 1;
  }

  close(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#loop.disable();
    this.flush();
    this.db.close();
  }
}
