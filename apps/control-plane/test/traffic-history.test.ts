import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { emptyState } from "../src/state-model.js";
import { SQLiteStore } from "../src/store.js";
import { initializeTrafficHistory, hydrateTrafficHistory } from "../src/traffic-history.js";

test("legacy migration preserves history and ownership, is idempotent, and isolates user reads", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE app_state (key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)");
  const state = emptyState();
  const stats = { requestCount: 123, firstRequestAt: "first", lastRequestAt: "last",
    ipAddresses: { "203.0.113.1": { ipAddress: "203.0.113.1", requestCount: 123, firstSeenAt: "first", lastSeenAt: "last" } } };
  for (const id of ["one", "two"]) {
    state.reservations[id] = { id, userId: id, subdomain: id, createdAt: "now", updatedAt: "now", lastUsedAt: "now", directRequestStats: stats };
  }
  state.accessHosts.child = { id: "child", userId: "one", reservationId: "one", hostname: "api.one.example.com", kind: "custom",
    createdAt: "now", updatedAt: "now", lastSeenAt: "now", requestStats: stats };
  db.prepare("INSERT INTO app_state VALUES ('primary',?,'now')").run(JSON.stringify(state));
  initializeTrafficHistory(db);
  initializeTrafficHistory(db);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM traffic_history").get()?.count, 3);
  const compact = JSON.parse(db.prepare("SELECT value FROM app_state").get()!.value as string);
  assert.equal(compact.reservations.one.userId, "one");
  assert.equal(compact.reservations.one.directRequestStats, undefined);
  assert.equal(compact.accessHosts.child.requestStats, undefined);
  hydrateTrafficHistory(db, compact, "one");
  assert.deepEqual(compact.reservations.one.directRequestStats, stats);
  assert.deepEqual(compact.accessHosts.child.requestStats, stats);
  assert.equal(compact.reservations.two.directRequestStats, undefined);
  hydrateTrafficHistory(db, compact);
  assert.deepEqual(compact.reservations.two.directRequestStats, stats);
  db.close();
});

test("metadata updates preserve counters; clearing and releasing remove only the requested history", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "bore-traffic-")), "bore.sqlite");
  const store = new SQLiteStore(path);
  await store.init();
  await store.upsertUser({ id: "u", email: "traffic@example.com" });
  await store.update((state) => {
    state.reservations.r = { id: "r", userId: "u", subdomain: "test", createdAt: "now", updatedAt: "now", lastUsedAt: "now" };
    state.accessHosts.c = { id: "c", userId: "u", reservationId: "r", hostname: "api.test.example.com", kind: "custom", createdAt: "now", updatedAt: "now", lastSeenAt: "now" };
  });
  const entry = { host: "test.example.com", ipAddress: "203.0.113.1", count: 20, firstAt: "first", lastAt: "last" };
  await store.recordTraffic([{ ...entry, kind: "direct", id: "r" }, { ...entry, kind: "child", id: "c" }]);
  await store.update((state) => { state.reservations.r!.lastUsedAt = "later"; });
  assert.equal(store.snapshot().reservations.r?.directRequestStats?.requestCount, 20);
  assert.equal(store.snapshot().accessHosts.c?.requestStats?.requestCount, 20);
  assert.equal(store.routingSnapshot().reservations.r?.directRequestStats, undefined);
  await store.clearRequestStats("direct", "r");
  assert.equal(store.snapshot().reservations.r?.directRequestStats, undefined);
  assert.equal(store.snapshot().accessHosts.c?.requestStats?.requestCount, 20);
  await store.update((state) => { delete state.accessHosts.c; });
  await store.recordTraffic([{ ...entry, kind: "child", id: "c" }]);
  const db = new DatabaseSync(path, { readOnly: true });
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM traffic_history").get()?.count, 0);
  db.close();
});
