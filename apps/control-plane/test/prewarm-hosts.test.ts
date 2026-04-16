import assert from "node:assert/strict";
import test from "node:test";

import { emptyState } from "../src/state-model.js";
import { diffAddedHostnames, listDevicePublicHostnames } from "../src/prewarm-hosts.js";
import type { PersistedState } from "../src/types.js";

function buildState(): PersistedState {
  return emptyState();
}

test("lists unique public hostnames for a device reservation and its child hosts", () => {
  const state = buildState();

  state.reservations["reservation-1"] = {
    id: "reservation-1",
    userId: "user-1",
    subdomain: "pia",
    createdAt: "2026-03-18T10:00:00.000Z",
    updatedAt: "2026-03-18T10:00:00.000Z",
    lastUsedAt: "2026-03-18T10:00:00.000Z",
  };
  state.deviceTunnels["tunnel-1"] = {
    id: "tunnel-1",
    userId: "user-1",
    deviceId: "device-1",
    localPort: 3000,
    reservationId: "reservation-1",
    subdomain: "pia",
    claimedAt: "2026-03-18T10:00:00.000Z",
    updatedAt: "2026-03-18T10:00:00.000Z",
  };
  state.deviceTunnels["tunnel-2"] = {
    id: "tunnel-2",
    userId: "user-1",
    deviceId: "device-1",
    localPort: 4000,
    reservationId: "reservation-1",
    subdomain: "pia",
    claimedAt: "2026-03-18T10:00:00.000Z",
    updatedAt: "2026-03-18T10:00:00.000Z",
  };
  state.accessHosts["access-host-1"] = {
    id: "access-host-1",
    userId: "user-1",
    reservationId: "reservation-1",
    hostname: "api.pia",
    kind: "custom",
    createdAt: "2026-03-18T10:00:00.000Z",
    updatedAt: "2026-03-18T10:00:00.000Z",
    lastSeenAt: "2026-03-18T10:00:00.000Z",
  };

  assert.deepEqual(listDevicePublicHostnames(state, "device-1", "example.com"), [
    "api.pia.example.com",
    "pia.example.com",
  ]);
});

test("only prewarms newly introduced public hostnames across syncs", () => {
  const previous = buildState();
  previous.reservations["reservation-1"] = {
    id: "reservation-1",
    userId: "user-1",
    subdomain: "pia",
    createdAt: "2026-03-18T10:00:00.000Z",
    updatedAt: "2026-03-18T10:00:00.000Z",
    lastUsedAt: "2026-03-18T10:00:00.000Z",
  };
  previous.deviceTunnels["tunnel-1"] = {
    id: "tunnel-1",
    userId: "user-1",
    deviceId: "device-1",
    localPort: 3000,
    reservationId: "reservation-1",
    subdomain: "pia",
    claimedAt: "2026-03-18T10:00:00.000Z",
    updatedAt: "2026-03-18T10:00:00.000Z",
  };
  previous.accessHosts["access-host-1"] = {
    id: "access-host-1",
    userId: "user-1",
    reservationId: "reservation-1",
    hostname: "api.pia",
    kind: "custom",
    createdAt: "2026-03-18T10:00:00.000Z",
    updatedAt: "2026-03-18T10:00:00.000Z",
    lastSeenAt: "2026-03-18T10:00:00.000Z",
  };

  const unchanged = structuredClone(previous);
  assert.deepEqual(
    diffAddedHostnames(
      listDevicePublicHostnames(previous, "device-1", "example.com"),
      listDevicePublicHostnames(unchanged, "device-1", "example.com"),
    ),
    [],
  );

  const next = buildState();
  next.reservations["reservation-2"] = {
    id: "reservation-2",
    userId: "user-1",
    subdomain: "alex",
    createdAt: "2026-03-18T10:05:00.000Z",
    updatedAt: "2026-03-18T10:05:00.000Z",
    lastUsedAt: "2026-03-18T10:05:00.000Z",
  };
  next.deviceTunnels["tunnel-1"] = {
    id: "tunnel-1",
    userId: "user-1",
    deviceId: "device-1",
    localPort: 3000,
    reservationId: "reservation-2",
    subdomain: "alex",
    claimedAt: "2026-03-18T10:05:00.000Z",
    updatedAt: "2026-03-18T10:05:00.000Z",
  };
  next.accessHosts["access-host-2"] = {
    id: "access-host-2",
    userId: "user-1",
    reservationId: "reservation-2",
    hostname: "api.alex",
    kind: "custom",
    createdAt: "2026-03-18T10:05:00.000Z",
    updatedAt: "2026-03-18T10:05:00.000Z",
    lastSeenAt: "2026-03-18T10:05:00.000Z",
  };

  assert.deepEqual(
    diffAddedHostnames(
      listDevicePublicHostnames(previous, "device-1", "example.com"),
      listDevicePublicHostnames(next, "device-1", "example.com"),
    ),
    ["alex.example.com", "api.alex.example.com"],
  );
});
