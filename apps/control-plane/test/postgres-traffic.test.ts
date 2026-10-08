import assert from "node:assert/strict";
import test, { after } from "node:test";
import { closeDatabase, query } from "@bore/database";
import { postgresEnabled, postgresFixture } from "./postgres-fixture.js";

after(async () => { if (postgresEnabled) await closeDatabase(); });

test("PostgreSQL traffic histories remain scoped, concurrent increments survive, and reset/release prune rows", { skip: !postgresEnabled }, async (t) => {
  const { user, store, other, coordinator, deviceId, close } = await postgresFixture();
  t.after(close);
  await coordinator.setDeviceConnection(deviceId, true);
  await coordinator.syncDeviceTunnels(user, deviceId, [{ localPort: 3000 }]);
  const namespace = (await coordinator.listUserNamespaces(user))[0]!;
  const host = await coordinator.reserveAccessHostname(user, namespace.subdomain, "api");
  const now = new Date(Date.now() + 1000).toISOString();
  const entry = { host: `${namespace.subdomain}.example.com`, ipAddress: "203.0.113.10", count: 1, firstAt: now, lastAt: now };
  await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? store : other).recordTraffic([
    { ...entry, id: namespace.reservationId, kind: "direct" }, { ...entry, id: host.id, kind: "child" },
  ])));
  const current = (await coordinator.listUserNamespaces(user))[0]!;
  assert.equal(current.directRequestStats.requestCount, 20);
  assert.equal(current.accessHosts[0]?.requestStats.requestCount, 20);
  assert.equal(current.accessHosts[0]?.lastSeenAt, now);
  const routing = store.routingSnapshot();
  assert.equal(routing.reservations[namespace.reservationId]?.directRequestStats, undefined);
  assert.equal(routing.accessHosts[host.id]?.requestStats, undefined);
  const unrelated = await store.userSnapshot("not-this-user");
  assert.equal(unrelated.reservations[namespace.reservationId]?.directRequestStats, undefined);
  await assert.rejects(coordinator.clearTraffic({ ...user, id: "not-owner" }, namespace.subdomain, { kind: "direct" }));
  assert.equal((await coordinator.listUserNamespaces(user))[0]?.directRequestStats.requestCount, 20);
  await coordinator.clearTraffic(user, namespace.subdomain, { kind: "direct" });
  assert.equal((await coordinator.listUserNamespaces(user))[0]?.directRequestStats.requestCount, 0);
  await coordinator.clearTraffic(user, namespace.subdomain, { kind: "child", label: "api" });
  assert.equal((await coordinator.listUserNamespaces(user))[0]?.accessHosts[0]?.requestStats.requestCount, 0);
  await store.recordTraffic([{ ...entry, id: host.id, kind: "child" }]);
  await coordinator.releaseNamespace(user, namespace.subdomain);
  const history = await query("SELECT id FROM traffic_history WHERE id=ANY($1::text[])", [[namespace.reservationId, host.id]]);
  assert.equal(history.rows.length, 0);
  await other.recordTraffic([{ ...entry, id: namespace.reservationId, kind: "direct" }]);
  assert.equal((await query("SELECT id FROM traffic_history WHERE id=$1", [namespace.reservationId])).rows.length, 0);
});

test("PostgreSQL child-host removal prunes only its history and refresh keeps identity edits current", { skip: !postgresEnabled }, async (t) => {
  const { user, store, coordinator, deviceId, close } = await postgresFixture();
  t.after(close);
  await coordinator.syncDeviceTunnels(user, deviceId, [{ localPort: 3000 }]);
  const namespace = (await coordinator.listUserNamespaces(user))[0]!;
  const host = await coordinator.reserveAccessHostname(user, namespace.subdomain, "api");
  await coordinator.recordHostnameRequest(`${namespace.subdomain}.example.com`, "203.0.113.10");
  await coordinator.recordHostnameRequest(`api.${namespace.subdomain}.example.com`, "203.0.113.10");
  await coordinator.removeAccessHostname(user, namespace.subdomain, "api");
  assert.equal((await query("SELECT id FROM traffic_history WHERE id=$1", [host.id])).rows.length, 0);
  assert.equal((await coordinator.listUserNamespaces(user))[0]?.directRequestStats.requestCount, 1);
  await query("UPDATE users SET name='Fresh user name' WHERE id=$1", [user.id]);
  assert.equal((await store.userSnapshot(user.id)).users[user.id]?.name, "Fresh user name");
});
