import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createMonitoringStorage, type MonitoringStorage } from "../src/monitoring/adapter.js";
import { TunnelMonitoring } from "../src/monitoring/recorder.js";
import { buildMonitoringReport } from "../src/monitoring/report-data.js";

const path = () => join(mkdtempSync(join(tmpdir(), "bore-monitoring-adapter-")), "monitoring.sqlite");
const count = (monitoring: TunnelMonitoring) => monitoring.db.prepare("SELECT SUM(count) AS n FROM requests").get()?.n;

test("failed flush retains requests and device events, including events arriving during retry", async () => {
  const storage = createMonitoringStorage(path(), undefined);
  let fail = true;
  const adapter: MonitoringStorage = {
    get db() { return storage.db; },
    async saveBatch(batch) { if (fail) throw new Error("database unavailable"); await storage.saveBatch(batch); },
    saveProbe: (row) => storage.saveProbe(row), prune: (now) => storage.prune(now), close: () => storage.close(),
  };
  const monitoring = new TunnelMonitoring("ignored", { storage: adapter });
  monitoring.trace("retry.example.com", "http").finish(200);
  monitoring.deviceEvent("device-retry", "connected");
  await assert.rejects(monitoring.flush(), /database unavailable/);
  monitoring.trace("retry.example.com", "http").finish(200);
  monitoring.deviceEvent("device-retry", "connected");
  fail = false;
  await monitoring.flush();
  assert.equal(count(monitoring), 1);
  await monitoring.flush();
  assert.equal(count(monitoring), 2);
  assert.equal(monitoring.db.prepare("SELECT SUM(count) AS n FROM device_events").get()?.n, 2);
  await monitoring.close();
});

test("overlapping flushes share one write and shutdown drains the newer buffer", async () => {
  const storage = createMonitoringStorage(path(), undefined);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let writes = 0;
  const monitoring = new TunnelMonitoring("ignored", { storage: {
    get db() { return storage.db; },
    async saveBatch(batch) { writes++; await gate; await storage.saveBatch(batch); },
    saveProbe: (row) => storage.saveProbe(row), prune: (now) => storage.prune(now), close: () => storage.close(),
  } });
  monitoring.trace("concurrent.example.com", "http").finish(200);
  const first = monitoring.flush();
  const second = monitoring.flush();
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(writes, 1);
  monitoring.trace("concurrent.example.com", "http").finish(200);
  release();
  await first;
  assert.equal(count(monitoring), 1);
  await monitoring.close();
  assert.equal(writes, 2);
});

test("retry buffers stay bounded without removing the failed batch or changing its minute", async (t) => {
  const batches: Array<{ minute: number; count: number }[]> = [];
  let failing = true;
  let now = 1_000_000;
  t.mock.method(Date, "now", () => now);
  const monitoring = new TunnelMonitoring("ignored", { storage: {
    async saveBatch(batch) {
      if (failing) throw new Error("offline");
      batches.push(batch.requests.map((row) => ({ minute: row.minute, count: row.count })));
    },
    async saveProbe() {}, async prune() {}, async close() {},
  } });
  for (let index = 0; index < 2048; index++) monitoring.trace(`${index}.old.example`, "http").finish(200);
  await assert.rejects(monitoring.flush(), /offline/);
  now += 60_000;
  for (let index = 0; index < 2100; index++) monitoring.trace(`${index}.new.example`, "http").finish(200);
  await assert.rejects(monitoring.flush(), /offline/);
  failing = false;
  await monitoring.flush();
  await monitoring.flush();
  assert.equal(batches[0]?.length, 2048);
  assert.equal(batches[1]?.length, 2048);
  assert.ok(batches[0]?.every((row) => row.minute === 960_000 && row.count === 1));
  assert.ok(batches[1]?.every((row) => row.minute === 1_020_000 && row.count === 1));
  await monitoring.close();
});

test("SQLite reports retain their JSON output fields and hostname filtering", async () => {
  const sqlitePath = path();
  const monitoring = new TunnelMonitoring(sqlitePath, { storage: createMonitoringStorage(sqlitePath, undefined) });
  monitoring.trace("report.example.com", "http").finish(200);
  monitoring.trace("other.example.com", "http").finish(503);
  monitoring.deviceEvent("report-device", "closed", 1006);
  await monitoring.flush();
  await monitoring.storage.saveProbe({ time: Date.now(), host: "report.example.com", status: 502, durationMs: 123,
    error: { expectedConnected: true, error: "upstream" } });
  const result = await buildMonitoringReport(1, "report.example.com", { databaseUrl: undefined, sqlitePath });
  assert.equal((result.requests as unknown[]).length, 1);
  assert.equal((result.latencyP95 as unknown[]).length, 1);
  assert.equal((result.recentProbeFailures as unknown[]).length, 1);
  assert.deepEqual((result.deviceEvents as object[]).map((row) => ({ ...row })), [{ deviceId: "report-device", event: "closed", code: 1006, count: 1 }]);
  await assert.rejects(buildMonitoringReport(337, undefined, { databaseUrl: undefined, sqlitePath }), /Hours/);
  await monitoring.close();
});
