import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";
import { closeDatabase, ensureSchema, getUserUsage, query } from "@bore/database";
import { PostgresMonitoringStorage } from "./postgres.js";
import { historyRows } from "./history.js";
import type { MonitoringBatch } from "./adapter.js";
import { PostgreSQLStore } from "../postgres-store.js";
import { TunnelCoordinator } from "../tunnel-coordinator.js";

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const database = `bore_history_${randomUUID().replaceAll("-", "")}`;
before(async () => {
  if (!enabled) return;
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await query(`CREATE DATABASE "${database}"`);
  await closeDatabase();
  const url = new URL(process.env.TEST_DATABASE_URL!);
  url.pathname = `/${database}`;
  process.env.DATABASE_URL = url.toString();
});
after(async () => {
  if (!enabled) return;
  await closeDatabase();
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await query(`DROP DATABASE "${database}" WITH (FORCE)`);
  await closeDatabase();
});

test("PostgreSQL usage is exactly-once on retries, owner-scoped and independent of reset/deletion", { skip: !enabled }, async () => {
  await ensureSchema();
  const storage = new PostgresMonitoringStorage();
  const owner = randomUUID();
  const other = randomUUID();
  const writerId = randomUUID();
  const reservationId = randomUUID();
  const childId = randomUUID();
  const batch: MonitoringBatch = { requests: [], devices: [], samples: [], delivery: { writerId, sequence: 1 }, usage: [
    { day: "2025-01-31", userId: owner, reservationId, accessHostId: "", namespace: "reusable", host: "reusable.example", httpRequests: 10, websocketConnections: 1, syntheticRequests: 5 },
    { day: "2025-02-01", userId: owner, reservationId, accessHostId: "", namespace: "reusable", host: "reusable.example", httpRequests: 20, websocketConnections: 2, syntheticRequests: 6 },
    { day: "2025-02-01", userId: owner, reservationId, accessHostId: childId, namespace: "reusable", host: "child.reusable.example", httpRequests: 30, websocketConnections: 3, syntheticRequests: 7 },
    { day: "2025-02-01", userId: other, reservationId: randomUUID(), accessHostId: "", namespace: "reusable", host: "reusable.example", httpRequests: 999, websocketConnections: 0, syntheticRequests: 0 },
  ] };
  try {
    await Promise.all([storage.saveBatch(batch), storage.saveBatch(batch), storage.saveBatch(batch)]);
    const usage = await getUserUsage(owner, "2025-02");
    assert.equal(usage.totals.month.httpRequests, 50);
    assert.equal(usage.totals.lifetime.httpRequests, 60);
    assert.equal(usage.totals.month.websocketConnections, 5);
    assert.equal(usage.totals.month.syntheticRequests, 13);
    assert.equal(usage.totals.month.tcpTlsConnections, null);
    assert.equal(usage.limitsEnforced, false);
    assert.equal(usage.namespaces.length, 1);
    assert.equal(usage.namespaces[0]?.month.httpRequests, 50);
    assert.equal(usage.namespaces[0]?.hosts.length, 2);
    assert.equal(usage.namespaces[0]?.hosts.find((h) => h.accessHostId === childId)?.month.httpRequests, 30);
    assert.equal(usage.daily[0]?.httpRequests, 50);
    assert.equal((await getUserUsage(other, "2025-02")).totals.month.httpRequests, 999);
    assert.equal((await getUserUsage(owner, "2025-03")).totals.month.httpRequests, 0);
    assert.equal((await getUserUsage(owner, "2025-03")).totals.lifetime.httpRequests, 60);
    // No user/reservation/child foreign key: historical ownership survives object deletion and reuse.
    await query("DELETE FROM traffic_history WHERE id=ANY($1::text[])", [[reservationId, childId]]);
    await storage.prune(Date.now() + 365 * 86400_000);
    assert.equal((await getUserUsage(owner, "2025-02")).totals.month.httpRequests, 50);
    await assert.rejects(storage.saveBatch({ ...batch, delivery: { writerId, sequence: 3 } }), /Out-of-order/);
    await assert.rejects(storage.saveBatch({ ...batch, delivery: { writerId, sequence: 2 },
      devices: [{ minute: Date.now(), deviceId: writerId, event: "invalid", code: NaN, count: 1 }] }));
    assert.equal((await getUserUsage(owner, "2025-02")).totals.month.httpRequests, 50);
    await storage.saveBatch({ ...batch, delivery: { writerId, sequence: 2 } });
    assert.equal((await getUserUsage(owner, "2025-02")).totals.month.httpRequests, 100);
  } finally {
    await query("DELETE FROM monitoring.usage_counts WHERE user_id=ANY($1::text[])", [[owner, other]]);
    await query("DELETE FROM monitoring.writers WHERE id=$1", [writerId]);
  }
});

test("Daily history preserves weighted timings, histograms, resources and failures forever", { skip: !enabled }, async () => {
  await ensureSchema();
  const storage = new PostgresMonitoringStorage();
  const host = `${randomUUID()}.history.example`;
  const source = randomUUID();
  const time = Date.now() - 40 * 86400_000;
  const day = new Date(time).toISOString().slice(0, 10);
  const request = { minute: time, host, protocol: "http", outcome: "upstream_error", status: 502, count: 10,
    totalMs: 2500, maxMs: 800, routingMs: 100, relayMs: 2400, bytes: 1000, localMs: 1200, localCount: 8,
    histogram: [0, 0, 9, 0, 1, 0, 0, 0, 0] };
  try {
    await storage.saveBatch({ requests: [request], devices: [{ minute: time, deviceId: source, event: "disconnected", code: 1006, count: 3 }],
      samples: [{ time, source, data: { cpuPercent: 10, heapUsed: 1000, arbitraryMetric: 999, probes: [{ host }] } },
        { time: time + 1, source, data: { cpuPercent: 30, heapUsed: 3000 } }] });
    await storage.saveProbe({ time, host, status: 502, durationMs: 1200, error: { error: "timeout", expectedConnected: true, dnsMs: 10, tlsMs: 50 } });
    const before = await historyRows(day, day, host);
    await storage.prune();
    assert.equal((await query("SELECT 1 FROM monitoring.requests WHERE host=$1", [host])).rows.length, 0);
    assert.deepEqual(await historyRows(day, day, host), before);
    const count = before.find((r) => r.category === "requests" && r.metric === "count");
    assert.equal(count?.total, 10);
    assert.equal(before.find((r) => r.category === "requests" && r.metric === "bucket_2")?.total, 9);
    const runtime = before.find((r) => r.category === "runtime" && r.metric === "cpuPercent" && (r.dimensions as { source: string }).source === source);
    assert.equal(runtime?.total, 40);
    assert.equal(runtime?.minimum, 10);
    assert.equal(runtime?.maximum, 30);
    assert.equal(runtime?.observations, 2);
    assert.ok(!before.some((r) => r.metric === "arbitraryMetric"));
    assert.equal((before.find((r) => r.category === "probes")?.dimensions as { error: string }).error, "timeout");
    await storage.prune(Date.now() + 365 * 86400_000);
    assert.deepEqual(await historyRows(day, day, host), before);
    // Late, previously unpersisted data is additive without re-archiving old totals.
    await storage.saveBatch({ requests: [request], devices: [], samples: [] });
    assert.equal((await historyRows(day, day, host)).find((r) => r.category === "requests" && r.metric === "count")?.total, 20);
    await storage.prune();
    assert.equal((await historyRows(day, day, host)).find((r) => r.category === "requests" && r.metric === "count")?.total, 20);
  } finally {
    await query("DELETE FROM monitoring.requests WHERE host=$1", [host]);
    await query("DELETE FROM monitoring.probes WHERE host=$1", [host]);
    await query("DELETE FROM monitoring.samples WHERE source=$1", [source]);
    await query("DELETE FROM monitoring.device_events WHERE device_id=$1", [source]);
    await query("DELETE FROM monitoring.daily_metrics WHERE dimensions->>'host'=$1 OR dimensions->>'source'=$2 OR dimensions->>'deviceId'=$2", [host, source]);
  }
});

test("Failed compaction rolls back both archival and raw deletion", { skip: !enabled }, async () => {
  await ensureSchema();
  const storage = new PostgresMonitoringStorage();
  const host = `${randomUUID()}.rollback.example`;
  const source = randomUUID();
  const time = Date.now() - 40 * 86400_000;
  const day = new Date(time).toISOString().slice(0, 10);
  try {
    await storage.saveProbe({ time, host, status: 200, durationMs: 10, error: {} });
    await query("INSERT INTO monitoring.samples(time,source,data) VALUES ($1,$2,'{\"cpuPercent\":1e1000}'::jsonb)", [time, source]);
    await assert.rejects(storage.prune(), /out of range/);
    assert.equal((await query("SELECT 1 FROM monitoring.probes WHERE host=$1", [host])).rows.length, 1);
    assert.equal((await query("SELECT 1 FROM monitoring.daily_metrics WHERE dimensions->>'host'=$1", [host])).rows.length, 0);
    await query("DELETE FROM monitoring.samples WHERE source=$1", [source]);
    await storage.prune();
    assert.equal((await historyRows(day, day, host)).find((r) => r.metric === "duration_ms")?.total, 10);
  } finally {
    await query("DELETE FROM monitoring.samples WHERE source=$1", [source]);
    await query("DELETE FROM monitoring.probes WHERE host=$1", [host]);
    await query("DELETE FROM monitoring.daily_metrics WHERE dimensions->>'host'=$1", [host]);
  }
});

test("Ownership index is reused for unchanged metadata and invalidated on release/reuse", { skip: !enabled }, async () => {
  const store = new PostgreSQLStore();
  await store.init();
  const coordinator = new TunnelCoordinator(store, "example.com");
  const first = randomUUID();
  const second = randomUUID();
  try {
    await store.update((state) => { state.reservations[first] = { id: first, userId: "owner", subdomain: "reuse", createdAt: "now", updatedAt: "now", lastUsedAt: "now" }; });
    const target = coordinator.usageTarget("reuse.example.com");
    assert.equal(target?.reservationId, first);
    assert.equal(coordinator.usageTarget("reuse.example.com"), target);
    assert.equal(coordinator.usageTarget("unknown.reuse.example.com"), undefined);
    await store.update((state) => { delete state.reservations[first]; });
    assert.equal(coordinator.usageTarget("reuse.example.com"), undefined);
    await store.update((state) => { state.reservations[second] = { id: second, userId: "new-owner", subdomain: "reuse", createdAt: "now", updatedAt: "now", lastUsedAt: "now" }; });
    assert.equal(coordinator.usageTarget("reuse.example.com")?.userId, "new-owner");
    assert.equal(target?.userId, "owner");
  } finally { await store.close(); }
});
