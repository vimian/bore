import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readSnapshot } from "../src/bore-db.js";
import { UserFacingError } from "../src/errors.js";
import { SQLiteStore } from "../src/store.js";
import { TunnelCoordinator } from "../src/tunnel-coordinator.js";

async function setupCoordinator() {
  const dir = await mkdtemp(join(tmpdir(), "bore-control-plane-"));
  const filePath = join(dir, "bore.sqlite");
  const store = new SQLiteStore(filePath);
  await store.init();

  const coordinator = new TunnelCoordinator(store, "example.com");
  const user = await store.upsertUser({
    id: "user-123",
    email: "pia@example.com",
    name: "Pia Example",
  });

  await coordinator.registerDevice(user.id, {
    deviceId: "device-one",
    name: "Laptop",
    hostname: "laptop",
    platform: "darwin",
    fingerprint: "fp-1",
  });
  await coordinator.registerDevice(user.id, {
    deviceId: "device-two",
    name: "Desktop",
    hostname: "desktop",
    platform: "linux",
    fingerprint: "fp-2",
  });

  return { coordinator, filePath, store, user };
}

test("rejects reusing a reserved subdomain on another live device", async () => {
  const { coordinator, user } = await setupCoordinator();

  await coordinator.setDeviceConnection("device-one", true);
  await coordinator.syncDeviceTunnels(user, "device-one", [{ localPort: 80 }]);

  const firstList = await coordinator.listUserTunnels(user.id);
  assert.ok(firstList[0]?.subdomain);
  assert.equal(firstList[0]?.status, "active");
  const reservedNamespace = firstList[0]?.subdomain;

  await coordinator.setDeviceConnection("device-two", true);
  const secondSync = await coordinator.syncDeviceTunnels(user, "device-two", [
    { localPort: 80, preferredSubdomain: reservedNamespace },
  ]);

  assert.deepEqual(secondSync.failedTunnels, [
    {
      localPort: 80,
      subdomain: reservedNamespace,
      code: "namespace_active_elsewhere",
      message: `Namespace ${reservedNamespace} is already active on Laptop. Stop it there with bore down <port> before using it here.`,
    },
  ]);

  const secondList = await coordinator.listUserTunnels(user.id);
  const laptopTunnel = secondList.find((item) => item.deviceId === "device-one");
  const desktopTunnel = secondList.find((item) => item.deviceId === "device-two");

  assert.equal(laptopTunnel?.subdomain, reservedNamespace);
  assert.equal(laptopTunnel?.status, "active");
  assert.equal(desktopTunnel, undefined);
});

test("persists tunnel state to disk", async () => {
  const { coordinator, filePath, user } = await setupCoordinator();

  await coordinator.setDeviceConnection("device-one", true);
  await coordinator.syncDeviceTunnels(user, "device-one", [{ localPort: 8080 }]);
  const snapshot = readSnapshot(filePath);

  assert.equal(
    Object.values(snapshot.deviceTunnels).some((tunnel) => tunnel.localPort === 8080),
    true,
  );
});

test("routes the reserved base subdomain and registered child hosts", async () => {
  const { coordinator, user } = await setupCoordinator();

  await coordinator.setDeviceConnection("device-one", true);
  await coordinator.syncDeviceTunnels(user, "device-one", [{ localPort: 3000 }]);
  const assigned = (await coordinator.listUserTunnels(user.id))[0]?.subdomain;

  assert.ok(assigned);
  await coordinator.reserveAccessHostname(user, assigned, "api");

  const direct = coordinator.findActiveTunnelByHostname(`${assigned}.example.com`);
  const childHost = coordinator.findActiveTunnelByHostname(`api.${assigned}.example.com`);
  const unknownChild = coordinator.findActiveTunnelByHostname(`admin.${assigned}.example.com`);
  const deepNested = coordinator.findActiveTunnelByHostname(`v1.api.${assigned}.example.com`);

  assert.equal(direct?.subdomain, assigned);
  assert.equal(childHost?.subdomain, assigned);
  assert.equal(unknownChild, undefined);
  assert.equal(deepNested, undefined);
});

test("routes child hosts with a port override to the active namespace claimant", async () => {
  const { coordinator, filePath, user } = await setupCoordinator();

  await coordinator.setDeviceConnection("device-one", true);
  await coordinator.syncDeviceTunnels(user, "device-one", [{ localPort: 3000 }]);
  const assigned = (await coordinator.listUserTunnels(user.id))[0]?.subdomain;

  assert.ok(assigned);
  await coordinator.reserveAccessHostname(user, assigned, "api");
  await coordinator.setAccessHostnamePortOverride(user, assigned, "api", 4000);

  const direct = coordinator.findActiveTunnelByHostname(`${assigned}.example.com`);
  const childHost = coordinator.findActiveTunnelByHostname(`api.${assigned}.example.com`);
  const namespace = coordinator.listUserNamespaces(user).find((item) => item.subdomain === assigned);
  const snapshot = readSnapshot(filePath);
  const accessHostRecord = Object.values(snapshot.accessHosts).find(
    (item) => item.hostname === `api.${assigned}`,
  );

  assert.equal(direct?.localPort, 3000);
  assert.equal(childHost?.localPort, 4000);
  assert.equal(childHost?.deviceId, direct?.deviceId);
  assert.equal(namespace?.accessHosts.find((item) => item.label === "api")?.localPortOverride, 4000);
  assert.equal(accessHostRecord?.localPortOverride, 4000);
});

test("clearing a child-host port override falls back to the namespace port", async () => {
  const { coordinator, user } = await setupCoordinator();

  await coordinator.setDeviceConnection("device-one", true);
  await coordinator.syncDeviceTunnels(user, "device-one", [{ localPort: 3000 }]);
  const assigned = (await coordinator.listUserTunnels(user.id))[0]?.subdomain;

  assert.ok(assigned);
  await coordinator.reserveAccessHostname(user, assigned, "api");
  await coordinator.setAccessHostnamePortOverride(user, assigned, "api", 4000);
  await coordinator.clearAccessHostnamePortOverride(user, assigned, "api");

  const childHost = coordinator.findActiveTunnelByHostname(`api.${assigned}.example.com`);
  const namespace = coordinator.listUserNamespaces(user).find((item) => item.subdomain === assigned);

  assert.equal(childHost?.localPort, 3000);
  assert.equal(namespace?.accessHosts.find((item) => item.label === "api")?.localPortOverride, undefined);
});

test("does not create child hosts until the user reserves them", async () => {
  const { coordinator, user } = await setupCoordinator();

  await coordinator.setDeviceConnection("device-one", true);
  await coordinator.syncDeviceTunnels(user, "device-one", [{ localPort: 3000 }]);

  assert.deepEqual(coordinator.listAccessHosts(), []);
});

test("assigns different clients separate top-level namespaces", async () => {
  const { coordinator, store, user } = await setupCoordinator();
  const otherUser = await store.upsertUser({
    id: "user-456",
    email: "alex@example.com",
    name: "Alex Example",
  });

  await coordinator.registerDevice(otherUser.id, {
    deviceId: "device-three",
    name: "Workstation",
    hostname: "workstation",
    platform: "linux",
    fingerprint: "fp-3",
  });

  await coordinator.setDeviceConnection("device-one", true);
  await coordinator.setDeviceConnection("device-three", true);
  await coordinator.syncDeviceTunnels(user, "device-one", [{ localPort: 3000 }]);
  await coordinator.syncDeviceTunnels(otherUser, "device-three", [{ localPort: 4000 }]);

  const firstNamespace = (await coordinator.listUserTunnels(user.id))[0]?.subdomain;
  const secondNamespace = (await coordinator.listUserTunnels(otherUser.id))[0]?.subdomain;

  assert.ok(firstNamespace);
  assert.ok(secondNamespace);
  assert.notEqual(firstNamespace, secondNamespace);
  assert.equal(secondNamespace.endsWith(`.${firstNamespace}`), false);
  assert.equal(firstNamespace.endsWith(`.${secondNamespace}`), false);
});

test("keeps a reserved namespace available after a port is removed and lets the user reuse it", async () => {
  const { coordinator, user } = await setupCoordinator();

  await coordinator.setDeviceConnection("device-one", true);
  await coordinator.syncDeviceTunnels(user, "device-one", [{ localPort: 80 }]);
  const firstNamespace = (await coordinator.listUserTunnels(user.id))[0]?.subdomain;

  assert.ok(firstNamespace);

  await coordinator.syncDeviceTunnels(user, "device-one", []);
  const reusableAfterDown = await coordinator.syncDeviceTunnels(user, "device-one", []);

  assert.deepEqual(reusableAfterDown.reusableSubdomains, [firstNamespace]);

  await coordinator.syncDeviceTunnels(user, "device-one", [
    { localPort: 123, preferredSubdomain: firstNamespace },
  ]);
  const reassigned = await coordinator.listUserTunnels(user.id);

  assert.equal(reassigned[0]?.localPort, 123);
  assert.equal(reassigned[0]?.subdomain, firstNamespace);
});

test("does not offer namespaces that are actively claimed on another live device", async () => {
  const { coordinator, user } = await setupCoordinator();

  await coordinator.setDeviceConnection("device-one", true);
  await coordinator.setDeviceConnection("device-two", true);
  await coordinator.syncDeviceTunnels(user, "device-one", [{ localPort: 80 }]);
  const firstNamespace = (await coordinator.listUserTunnels(user.id)).find(
    (item) => item.deviceId === "device-one",
  )?.subdomain;

  assert.ok(firstNamespace);

  const secondDeviceView = await coordinator.syncDeviceTunnels(user, "device-two", [
    { localPort: 123, preferredSubdomain: firstNamespace },
  ]);
  const firstDeviceView = await coordinator.syncDeviceTunnels(user, "device-one", [{ localPort: 80 }]);

  assert.deepEqual(secondDeviceView.failedTunnels, [
    {
      localPort: 123,
      subdomain: firstNamespace,
      code: "namespace_active_elsewhere",
      message: `Namespace ${firstNamespace} is already active on Laptop. Stop it there with bore down <port> before using it here.`,
    },
  ]);
  assert.equal(firstDeviceView.reusableSubdomains.includes(firstNamespace), false);
  assert.equal(secondDeviceView.reusableSubdomains.includes(firstNamespace), false);
});

test("allows unrelated namespaces in the same sync when one namespace is already active elsewhere", async () => {
  const { coordinator, user } = await setupCoordinator();

  await coordinator.setDeviceConnection("device-one", true);
  await coordinator.syncDeviceTunnels(user, "device-one", [{ localPort: 80 }]);
  const activeNamespace = (await coordinator.listUserTunnels(user.id))[0]?.subdomain;

  assert.ok(activeNamespace);

  const secondSync = await coordinator.syncDeviceTunnels(user, "device-two", [
    { localPort: 123, preferredSubdomain: activeNamespace },
    { localPort: 456, allocateNewSubdomain: true },
  ]);

  assert.equal(secondSync.failedTunnels.length, 1);
  assert.equal(secondSync.failedTunnels[0]?.localPort, 123);
  assert.equal(secondSync.failedTunnels[0]?.code, "namespace_active_elsewhere");
  assert.ok(secondSync.tunnels.some((item) => item.deviceId === "device-two" && item.localPort === 456));

  const snapshot = await coordinator.listUserTunnels(user.id);
  assert.equal(
    snapshot.filter((item) => item.subdomain === activeNamespace).length,
    1,
  );
});

test("enforces the per-user reservation limit when creating new namespaces", async () => {
  const { coordinator, store, user } = await setupCoordinator();

  await store.update((state) => {
    state.users[user.id] = {
      ...state.users[user.id]!,
      reservationLimit: 1,
    };
  });

  const limitedUser = store.snapshot().users[user.id]!;

  await coordinator.setDeviceConnection("device-one", true);
  await coordinator.syncDeviceTunnels(limitedUser, "device-one", [{ localPort: 3000 }]);

  await assert.rejects(
    () =>
      coordinator.syncDeviceTunnels(limitedUser, "device-one", [
        { localPort: 3000 },
        { localPort: 4000, allocateNewSubdomain: true },
      ]),
    (error: unknown) => {
      assert.ok(error instanceof UserFacingError);
      assert.equal(error.code, "namespace_limit_reached");
      assert.equal(error.status, 409);
      assert.deepEqual(error.details, {
        limit: 1,
        currentCount: 1,
      });
      return true;
    },
  );
});

test("reserves a custom child hostname for a namespace owner", async () => {
  const { coordinator, user } = await setupCoordinator();

  await coordinator.setDeviceConnection("device-one", true);
  await coordinator.syncDeviceTunnels(user, "device-one", [{ localPort: 3000 }]);
  const assigned = (await coordinator.listUserTunnels(user.id))[0]?.subdomain;

  assert.ok(assigned);

  const accessHost = await coordinator.reserveAccessHostname(user, assigned, "admin");

  assert.equal(accessHost.hostname, `admin.${assigned}`);
  assert.equal(accessHost.kind, "custom");
  assert.deepEqual(coordinator.listAccessHosts(), [`admin.${assigned}`]);
});

test("removes a reserved custom child hostname for a namespace owner", async () => {
  const { coordinator, user } = await setupCoordinator();

  await coordinator.setDeviceConnection("device-one", true);
  await coordinator.syncDeviceTunnels(user, "device-one", [{ localPort: 3000 }]);
  const assigned = (await coordinator.listUserTunnels(user.id))[0]?.subdomain;

  assert.ok(assigned);

  await coordinator.reserveAccessHostname(user, assigned, "admin");
  const removed = await coordinator.removeAccessHostname(user, assigned, "admin");

  assert.equal(removed.hostname, `admin.${assigned}`);
  assert.deepEqual(coordinator.listAccessHosts(), []);
});

test("releases an unused namespace and removes its child hosts", async () => {
  const { coordinator, user } = await setupCoordinator();

  await coordinator.setDeviceConnection("device-one", true);
  await coordinator.syncDeviceTunnels(user, "device-one", [{ localPort: 3000 }]);
  const assigned = (await coordinator.listUserTunnels(user.id))[0]?.subdomain;

  assert.ok(assigned);

  await coordinator.reserveAccessHostname(user, assigned, "admin");
  await coordinator.syncDeviceTunnels(user, "device-one", []);

  const released = await coordinator.releaseNamespace(user, assigned);

  assert.equal(released.releasedSubdomain, assigned);
  assert.deepEqual(released.removedAccessHostnames, [`admin.${assigned}`]);
  assert.deepEqual(coordinator.listReservedSubdomains(), []);
  assert.deepEqual(coordinator.listAccessHosts(), []);
});

test("does not release a namespace while it still has tunnel claims", async () => {
  const { coordinator, user } = await setupCoordinator();

  await coordinator.setDeviceConnection("device-one", true);
  await coordinator.syncDeviceTunnels(user, "device-one", [{ localPort: 3000 }]);
  const assigned = (await coordinator.listUserTunnels(user.id))[0]?.subdomain;

  assert.ok(assigned);

  await assert.rejects(
    () => coordinator.releaseNamespace(user, assigned),
    /still has 1 tunnel claim/,
  );
});

test("enforces the per-user child hostname limit for reserved child hosts", async () => {
  const { coordinator, store, user } = await setupCoordinator();

  await store.update((state) => {
    state.users[user.id] = {
      ...state.users[user.id]!,
      accessHostLimit: 1,
    };
  });

  const limitedUser = store.snapshot().users[user.id]!;

  await coordinator.setDeviceConnection("device-one", true);
  await coordinator.syncDeviceTunnels(limitedUser, "device-one", [{ localPort: 3000 }]);
  const assigned = (await coordinator.listUserTunnels(user.id))[0]?.subdomain;

  assert.ok(assigned);

  await coordinator.reserveAccessHostname(limitedUser, assigned, "admin");

  await assert.rejects(
    () => coordinator.reserveAccessHostname(limitedUser, assigned, "docs"),
    (error: unknown) => {
      assert.ok(error instanceof UserFacingError);
      assert.equal(error.code, "access_host_limit_reached");
      assert.equal(error.status, 409);
      assert.deepEqual(error.details, {
        limit: 1,
        currentCount: 1,
      });
      return true;
    },
  );
});

test("touching public traffic only updates existing child hosts", async () => {
  const { coordinator, user } = await setupCoordinator();

  await coordinator.setDeviceConnection("device-one", true);
  await coordinator.syncDeviceTunnels(user, "device-one", [{ localPort: 3000 }]);
  const assigned = (await coordinator.listUserTunnels(user.id))[0]?.subdomain;

  assert.ok(assigned);
  await coordinator.reserveAccessHostname(user, assigned, "api");

  const missing = await coordinator.touchAccessHostname(`admin.${assigned}.example.com`);
  assert.equal(missing, undefined);

  const existing = await coordinator.touchAccessHostname(`api.${assigned}.example.com`);
  assert.equal(existing?.hostname, `api.${assigned}`);
});

test("tracks direct namespace and child-host traffic separately by unique IP", async () => {
  const { coordinator, filePath, user } = await setupCoordinator();

  await coordinator.setDeviceConnection("device-one", true);
  await coordinator.syncDeviceTunnels(user, "device-one", [{ localPort: 3000 }]);
  const assigned = (await coordinator.listUserTunnels(user.id))[0]?.subdomain;

  assert.ok(assigned);
  await coordinator.reserveAccessHostname(user, assigned, "api");

  await coordinator.recordHostnameRequest(`${assigned}.example.com`, "203.0.113.10");
  await coordinator.recordHostnameRequest(`${assigned}.example.com`, "::ffff:203.0.113.10");
  await coordinator.recordHostnameRequest(`${assigned}.example.com`, "203.0.113.11");
  await coordinator.recordHostnameRequest(`api.${assigned}.example.com`, "203.0.113.10");
  await coordinator.recordHostnameRequest(`api.${assigned}.example.com`, "203.0.113.12");
  await coordinator.recordHostnameRequest(`admin.${assigned}.example.com`, "203.0.113.200");

  const namespace = coordinator.listUserNamespaces(user).find(
    (item) => item.subdomain === assigned,
  );

  assert.ok(namespace);
  assert.equal(namespace.directRequestStats.requestCount, 3);
  assert.equal(namespace.directRequestStats.uniqueIpCount, 2);
  assert.deepEqual(
    namespace.directRequestStats.ipAddresses.map((entry) => ({
      ipAddress: entry.ipAddress,
      requestCount: entry.requestCount,
    })),
    [
      { ipAddress: "203.0.113.10", requestCount: 2 },
      { ipAddress: "203.0.113.11", requestCount: 1 },
    ],
  );

  const accessHost = namespace.accessHosts.find((item) => item.label === "api");

  assert.ok(accessHost);
  assert.equal(accessHost.requestStats.requestCount, 2);
  assert.equal(accessHost.requestStats.uniqueIpCount, 2);
  assert.deepEqual(
    accessHost.requestStats.ipAddresses.map((entry) => ({
      ipAddress: entry.ipAddress,
      requestCount: entry.requestCount,
    })),
    [
      { ipAddress: "203.0.113.10", requestCount: 1 },
      { ipAddress: "203.0.113.12", requestCount: 1 },
    ],
  );

  const snapshot = readSnapshot(filePath);
  const reservation = Object.values(snapshot.reservations).find(
    (item) => item.subdomain === assigned,
  );

  assert.ok(reservation?.directRequestStats);
  assert.equal(reservation.directRequestStats.requestCount, 3);
});

test("clears traffic only for the targeted namespace scope", async () => {
  const { coordinator, filePath, user } = await setupCoordinator();

  await coordinator.setDeviceConnection("device-one", true);
  await coordinator.syncDeviceTunnels(user, "device-one", [{ localPort: 3000 }]);
  const assigned = (await coordinator.listUserTunnels(user.id))[0]?.subdomain;

  assert.ok(assigned);
  await coordinator.reserveAccessHostname(user, assigned, "api");
  await coordinator.reserveAccessHostname(user, assigned, "docs");

  await coordinator.recordHostnameRequest(`${assigned}.example.com`, "203.0.113.10");
  await coordinator.recordHostnameRequest(`api.${assigned}.example.com`, "203.0.113.11");
  await coordinator.recordHostnameRequest(`docs.${assigned}.example.com`, "203.0.113.12");

  await coordinator.clearTraffic(user, assigned, { kind: "direct" });

  let namespace = coordinator.listUserNamespaces(user).find((item) => item.subdomain === assigned);
  assert.ok(namespace);
  assert.equal(namespace.directRequestStats.requestCount, 0);
  assert.equal(
    namespace.accessHosts.find((item) => item.label === "api")?.requestStats.requestCount,
    1,
  );
  assert.equal(
    namespace.accessHosts.find((item) => item.label === "docs")?.requestStats.requestCount,
    1,
  );

  await coordinator.clearTraffic(user, assigned, { kind: "child", label: "api" });

  namespace = coordinator.listUserNamespaces(user).find((item) => item.subdomain === assigned);
  assert.ok(namespace);
  assert.equal(namespace.directRequestStats.requestCount, 0);
  assert.equal(
    namespace.accessHosts.find((item) => item.label === "api")?.requestStats.requestCount,
    0,
  );
  assert.equal(
    namespace.accessHosts.find((item) => item.label === "docs")?.requestStats.requestCount,
    1,
  );

  const snapshot = readSnapshot(filePath);
  const reservation = Object.values(snapshot.reservations).find(
    (item) => item.subdomain === assigned,
  );
  const apiAccessHost = Object.values(snapshot.accessHosts).find(
    (item) => item.hostname === `api.${assigned}`,
  );
  const docsAccessHost = Object.values(snapshot.accessHosts).find(
    (item) => item.hostname === `docs.${assigned}`,
  );

  assert.equal(reservation?.directRequestStats, undefined);
  assert.equal(apiAccessHost?.requestStats, undefined);
  assert.equal(docsAccessHost?.requestStats?.requestCount, 1);
});
