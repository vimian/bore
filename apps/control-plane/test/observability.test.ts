import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import test from "node:test";
import { SQLiteStore } from "../src/store.js";
import { TrafficBatcher } from "../src/traffic-batcher.js";
import { TunnelMonitoring } from "../src/monitoring/recorder.js";
import { probe } from "../src/monitoring/probe.js";
import { pruneMonitoring } from "../src/monitoring/storage.js";

const tempDb = () => join(mkdtempSync(join(tmpdir(), "bore-monitoring-")), "bore.sqlite");

test("serializes concurrent snapshot updates without losing changes and recovers after errors", async () => {
  const store = new SQLiteStore(tempDb());
  await store.init();
  await Promise.all(Array.from({ length: 20 }, (_, index) => store.upsertUser({ email: `${index}@example.com` })));
  await Promise.all(Array.from({ length: 20 }, (_, index) => store.update(async (state) => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    state.deviceConnections[String(index)] = { deviceId: String(index), connectedAt: "now" };
  })));
  assert.equal(Object.keys(store.snapshot().deviceConnections).length, 20);
  await assert.rejects(store.update(() => { throw new Error("expected"); }));
  await store.update((state) => { delete state.deviceConnections["0"]; });
  assert.equal(Object.keys(store.snapshot().deviceConnections).length, 19);
});

test("routing snapshots omit traffic history and immediately reflect route changes", async () => {
  const store = new SQLiteStore(tempDb());
  await store.init();
  await store.update((state) => {
    state.reservations.r = { id: "r", userId: "u", subdomain: "eva", createdAt: "now", updatedAt: "now", lastUsedAt: "now",
      directRequestStats: { requestCount: 1, firstRequestAt: "now", lastRequestAt: "now", ipAddresses: {} } };
  });
  const first = store.routingSnapshot();
  assert.equal(first.reservations.r?.directRequestStats, undefined);
  assert.equal(store.snapshot().reservations.r?.directRequestStats?.requestCount, 1);
  first.reservations.r!.subdomain = "mutated";
  assert.equal(store.routingSnapshot().reservations.r?.subdomain, "eva");
  await store.update((state) => { delete state.reservations.r; });
  assert.equal(store.routingSnapshot().reservations.r, undefined);
});

test("traffic batching preserves counts with bounded memory and one write per flush", async () => {
  const batches: unknown[][] = [];
  const batcher = new TrafficBatcher(async (entries) => { batches.push(entries); });
  for (let index = 0; index < 100; index++) batcher.record("eva.example.com", "203.0.113.1");
  assert.equal(batches.length, 0);
  await batcher.flush();
  assert.equal(batches.length, 1);
  assert.equal((batches[0]?.[0] as { count: number }).count, 100);
  for (let index = 0; index < 5000; index++) batcher.record("eva.example.com", String(index));
  assert.equal(batcher.dropped, 904);
  await batcher.flush();
  assert.equal(batches[1]?.length, 4096);
});

test("metrics aggregate across flushes, count aborted requests once, and prune expired buckets", async () => {
  const monitoring = new TunnelMonitoring(tempDb(), { databaseUrl: undefined });
  for (let index = 0; index < 2; index++) {
    const trace = monitoring.trace("eva.example.com", "http");
    trace.routed(); trace.sent(); trace.received(); trace.bytes = 50;
    trace.finish(200); trace.finish(499);
    await monitoring.flush();
  }
  const abort = monitoring.trace("eva.example.com", "http");
  abort.outcome = "client_aborted"; abort.finish(499);
  await monitoring.flush();
  const row = monitoring.db.prepare("SELECT count, bytes, histogram FROM requests WHERE status=200").get() as { count: number; bytes: number; histogram: string };
  assert.equal(row.count, 2);
  assert.equal(row.bytes, 100);
  assert.equal(JSON.parse(row.histogram).reduce((sum: number, count: number) => sum + count, 0), 2);
  assert.equal(monitoring.db.prepare("SELECT count FROM requests WHERE status=499").get()?.count, 1);
  monitoring.deviceEvent("device-one", "connected");
  monitoring.deviceEvent("device-one", "connected");
  monitoring.deviceEvent("device-one", "closed", 1006);
  await monitoring.flush();
  assert.equal(monitoring.db.prepare("SELECT count FROM device_events WHERE event='connected'").get()?.count, 2);
  assert.equal(monitoring.db.prepare("SELECT code FROM device_events WHERE event='closed'").get()?.code, 1006);
  pruneMonitoring(monitoring.db, Date.now() + 15 * 86400_000);
  assert.equal(monitoring.db.prepare("SELECT COUNT(*) AS count FROM requests").get()?.count, 0);
  assert.equal(monitoring.db.prepare("SELECT COUNT(*) AS count FROM device_events").get()?.count, 0);
  await monitoring.close();
});

test("independent probes detect a hung service with a wall-clock deadline", async () => {
  const server = createServer((_request, _response) => {});
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const result = await probe(`http://127.0.0.1:${address.port}/health`, 50);
    assert.equal(result.status, 0);
    assert.equal(result.error, "timeout");
    assert.ok(result.durationMs < 1000);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
