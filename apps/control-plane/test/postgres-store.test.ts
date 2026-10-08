import assert from "node:assert/strict";
import test, { after } from "node:test";
import { closeDatabase, getUserById, query } from "@bore/database";
import { postgresEnabled, postgresFixture } from "./postgres-fixture.js";

after(async () => { if (postgresEnabled) await closeDatabase(); });

test("PostgreSQL writers lock current metadata across independent stores and publish only committed results", { skip: !postgresEnabled }, async (t) => {
  const { prefix, store, other, close } = await postgresFixture();
  t.after(close);
  await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? store : other).update(async (state) => {
    const id = `${prefix}-${i}`;
    state.deviceConnections[id] = { deviceId: id, connectedAt: "now" };
    assert.equal((i % 2 ? store : other).snapshot().deviceConnections[id], undefined);
    await new Promise((resolve) => setTimeout(resolve, 1));
  })));
  await store.refresh();
  assert.equal(Object.keys(store.snapshot().deviceConnections).filter((id) => id.startsWith(prefix)).length, 20);
  await assert.rejects(store.update((state) => {
    delete state.devices[`${prefix}-device`];
    throw new Error("rollback expected");
  }), /rollback expected/);
  assert.ok(store.snapshot().devices[`${prefix}-device`]);
  assert.equal(store.ready(), false);
  await store.refresh();
  assert.equal(store.ready(), true);
  assert.ok(store.snapshot().devices[`${prefix}-device`]);
});

test("PostgreSQL metadata writes never overwrite independently edited identities or quotas", { skip: !postgresEnabled }, async (t) => {
  const { user, store, close } = await postgresFixture();
  t.after(close);
  await store.update(async (state) => {
    assert.equal(state.users[user.id]?.reservationLimit, 20);
    await query("UPDATE users SET reservation_limit=400,access_host_limit=800,name='Externally updated' WHERE id=$1", [user.id]);
    state.users[user.id]!.reservationLimit = 1;
    state.users[user.id]!.name = "Stale identity";
  });
  const current = await getUserById(user.id);
  assert.equal(current?.reservationLimit, 400);
  assert.equal(current?.accessHostLimit, 800);
  assert.equal(current?.name, "Externally updated");
  assert.deepEqual(store.snapshot().users, {});
  const { rows } = await query<{ value: { users?: unknown } }>("SELECT value FROM app_state WHERE key='primary'");
  assert.ok(!rows[0]!.value.users || Object.keys(rows[0]!.value.users as object).length === 0);
  let freshLimit: number | undefined;
  await store.update((state) => { freshLimit = state.users[user.id]?.reservationLimit; });
  assert.equal(freshLimit, 400);
});

test("PostgreSQL coordinator uses current quotas instead of an earlier authentication snapshot", { skip: !postgresEnabled }, async (t) => {
  const { user, coordinator, deviceId, close } = await postgresFixture();
  t.after(close);
  await query("UPDATE users SET reservation_limit=0 WHERE id=$1", [user.id]);
  await assert.rejects(coordinator.syncDeviceTunnels(user, deviceId, [{ localPort: 3000 }]),
    (error: unknown) => (error as { code: string }).code === "namespace_limit_reached");
  assert.equal((await coordinator.listUserNamespaces(user)).length, 0);
});

test("PostgreSQL readiness fails on refresh errors and recovers without discarding cached routes", { skip: !postgresEnabled }, async (t) => {
  const { deviceId, store, close } = await postgresFixture();
  t.after(close);
  const databaseUrl = process.env.DATABASE_URL;
  await closeDatabase();
  process.env.DATABASE_URL = "postgresql://bore:test-password@127.0.0.1:1/bore_test";
  try {
    await assert.rejects(store.refresh());
    assert.equal(store.ready(), false);
    assert.ok(store.routingSnapshot().devices[deviceId]);
  } finally {
    await closeDatabase();
    process.env.DATABASE_URL = databaseUrl;
  }
  await store.refresh();
  assert.equal(store.ready(), true);
});

test("PostgreSQL update queues are bounded and reject overload with a retryable 503", { skip: !postgresEnabled }, async (t) => {
  const { store, close } = await postgresFixture();
  t.after(close);
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const first = store.update(async () => { entered(); await gate; });
  await started;
  const pending = Array.from({ length: 255 }, () => store.update(() => undefined));
  try {
    await assert.rejects(store.update(() => undefined), (error: unknown) => {
      const result = error as { status: number; code: string };
      return result.status === 503 && result.code === "database_busy";
    });
    assert.equal(store.ready(), true);
  } finally { release(); await Promise.all([first, ...pending]); }
  await store.update(() => undefined);
});

test("PostgreSQL refresh observes external commits without permitting snapshot mutation", { skip: !postgresEnabled }, async (t) => {
  const { prefix, store, other, close } = await postgresFixture();
  t.after(close);
  const id = `${prefix}-external`;
  await other.update((state) => { state.deviceConnections[id] = { deviceId: id, connectedAt: "external" }; });
  assert.equal(store.snapshot().deviceConnections[id], undefined);
  await store.refresh();
  assert.equal(store.snapshot().deviceConnections[id]?.connectedAt, "external");
  store.snapshot().deviceConnections[id]!.connectedAt = "mutated";
  assert.equal(store.snapshot().deviceConnections[id]?.connectedAt, "external");
  await other.close();
  assert.equal(other.ready(), false);
  await assert.rejects(other.refresh(), /closed/);
});
