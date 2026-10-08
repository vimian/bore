import assert from "node:assert/strict";
import test from "node:test";
import { buildDashboardOverview } from "../src/lib/dashboard-view";
import {
  hydrateDashboardTraffic, normalizeDashboardState, viewerTrafficIds,
} from "../src/lib/dashboard-state";
import {
  addClaim, addHost, addReservation, EARLIER, makeState, makeStats, makeUser, NOW,
} from "./dashboard-fixtures";

test("empty metadata preserves the dashboard response shape and quota values", () => {
  const overview = buildDashboardOverview(normalizeDashboardState(null), makeUser(), "bore.dk");
  assert.deepEqual(overview, {
    user: {
      id: "alice", email: "alice@example.com", name: "Alice",
      reservationLimit: 2, accessHostLimit: 5, reservedNamespaceCount: 0,
      accessHostCount: 0, remainingNamespaceSlots: 2, remainingAccessHostSlots: 5,
    },
    namespaces: [],
  });
});

test("namespace and child quotas count only the viewer and exclude default hosts", () => {
  const state = makeState();
  addReservation(state, "zeta");
  addReservation(state, "alpha");
  addReservation(state, "bob", "bob");
  addHost(state, "web", "alpha", "default");
  addHost(state, "api", "alpha");
  addHost(state, "other", "bob", "custom", "bob");
  const overview = buildDashboardOverview(state, makeUser({ reservationLimit: 1, accessHostLimit: 0 }), "v2.bore.dk");
  assert.deepEqual(overview.namespaces.map((item) => item.subdomain), ["alpha", "zeta"]);
  assert.equal(overview.user.reservedNamespaceCount, 2);
  assert.equal(overview.user.accessHostCount, 1);
  assert.equal(overview.user.remainingNamespaceSlots, 0);
  assert.equal(overview.user.remainingAccessHostSlots, 0);
  assert.equal(overview.namespaces[0].publicUrl, "https://alpha.v2.bore.dk");
  assert.deepEqual(overview.namespaces[0].accessHosts.map((host) => [host.label, host.publicUrl]), [
    ["api", "https://api.alpha.v2.bore.dk"], ["web", "https://web.alpha.v2.bore.dk"],
  ]);
});

test("legacy missing host kinds and host limits retain their defaults", () => {
  const state = makeState();
  addReservation(state, "alpha");
  addHost(state, "api", "alpha");
  Object.assign(state.accessHosts.api, { kind: undefined });
  const overview = buildDashboardOverview(state, Object.assign(makeUser(), { accessHostLimit: undefined }), "bore.dk");
  assert.equal(overview.user.accessHostLimit, 5);
  assert.equal(overview.user.accessHostCount, 1);
  assert.equal(overview.user.remainingAccessHostSlots, 4);
  assert.equal(overview.namespaces[0].accessHosts[0].kind, "custom");
});

test("connected claims select the latest winner and preserve offline and available states", () => {
  const state = makeState();
  for (const id of ["active", "offline", "available"]) addReservation(state, id);
  addClaim(state, "older", "active", true, EARLIER);
  addClaim(state, "newer", "active", true, NOW);
  addClaim(state, "disconnected", "active", false, "2026-10-08T13:00:00.000Z");
  addClaim(state, "offline-device", "offline", false);
  const overview = buildDashboardOverview(state, makeUser(), "bore.dk");
  assert.deepEqual(overview.namespaces.map((item) => [item.subdomain, item.status]), [
    ["active", "active"], ["available", "available"], ["offline", "offline"],
  ]);
  const claims = overview.namespaces[0].claims;
  assert.deepEqual(claims.map((item) => [item.tunnelId, item.status]), [
    ["disconnected", "offline"], ["newer", "active"], ["older", "blocked"],
  ]);
  assert.deepEqual(claims[1], {
    tunnelId: "newer", deviceId: "newer", deviceName: "newer device", hostname: "newer.local",
    platform: "linux", localPort: 3000, status: "active", claimedAt: NOW, updatedAt: NOW, lastSeenAt: NOW,
  });
});

test("claim tie breaking uses updatedAt and missing devices are omitted", () => {
  const state = makeState();
  addReservation(state, "alpha");
  addClaim(state, "older", "alpha", true);
  state.deviceTunnels.older.updatedAt = EARLIER;
  addClaim(state, "newer", "alpha", true);
  let overview = buildDashboardOverview(state, makeUser(), "bore.dk");
  assert.deepEqual(overview.namespaces[0].claims.map((item) => [item.tunnelId, item.status]), [
    ["newer", "active"], ["older", "blocked"],
  ]);
  delete state.devices.newer;
  overview = buildDashboardOverview(state, makeUser(), "bore.dk");
  assert.equal(overview.namespaces[0].status, "blocked");
  assert.deepEqual(overview.namespaces[0].claims.map((item) => item.tunnelId), ["older"]);
});

test("traffic queries and hydration are restricted to the viewer and known scopes", () => {
  const state = makeState();
  addReservation(state, "alpha");
  addReservation(state, "bob", "bob");
  addHost(state, "api", "alpha");
  addHost(state, "other", "bob", "custom", "bob");
  assert.deepEqual(viewerTrafficIds(state, "alice"), ["alpha", "api"]);
  const stats = makeStats();
  hydrateDashboardTraffic(state, "alice", [
    { kind: "direct", id: "alpha", value: stats },
    { kind: "child", id: "api", value: stats },
    { kind: "direct", id: "bob", value: stats },
    { kind: "child", id: "other", value: stats },
    { kind: "unknown", id: "bob", value: stats },
    { kind: "child", id: "missing", value: stats },
  ]);
  assert.equal(state.reservations.bob.directRequestStats, undefined);
  assert.equal(state.accessHosts.other.requestStats, undefined);
  assert.equal(state.accessHosts.api.requestStats, stats);
  assert.equal(state.reservations.alpha.directRequestStats, stats);
});

test("traffic stats preserve totals, dates, IP sorting and zero defaults", () => {
  const state = makeState();
  addReservation(state, "alpha");
  addReservation(state, "empty");
  addHost(state, "api", "alpha");
  const stats = makeStats();
  hydrateDashboardTraffic(state, "alice", [
    { kind: "direct", id: "alpha", value: stats },
    { kind: "child", id: "api", value: stats },
  ]);
  const overview = buildDashboardOverview(state, makeUser(), "bore.dk");
  const view = overview.namespaces[0].directRequestStats;
  assert.equal(view.requestCount, 8);
  assert.equal(view.uniqueIpCount, 3);
  assert.equal(view.firstRequestAt, EARLIER);
  assert.equal(view.lastRequestAt, NOW);
  assert.deepEqual(view.ipAddresses.map((item) => item.ipAddress), ["192.0.2.1", "192.0.2.2", "192.0.2.3"]);
  assert.deepEqual(overview.namespaces[0].accessHosts[0].requestStats, view);
  assert.deepEqual(overview.namespaces[1].directRequestStats, {
    requestCount: 0, uniqueIpCount: 0, ipAddresses: [],
  });
  assert.deepEqual(Object.keys(stats.ipAddresses), ["192.0.2.3", "192.0.2.2", "192.0.2.1"]);
});
