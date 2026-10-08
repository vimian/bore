import type { UserRecord } from "@bore/database";
import type { DashboardState, RequestStatsRecord } from "../src/lib/dashboard-types";
import { normalizeDashboardState } from "../src/lib/dashboard-state";

export const NOW = "2026-10-08T12:00:00.000Z";
export const EARLIER = "2026-10-08T11:00:00.000Z";

export function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: "alice", email: "alice@example.com", name: "Alice",
    reservationLimit: 2, accessHostLimit: 5, createdAt: NOW, updatedAt: NOW,
    ...overrides,
  };
}

export function makeState(): DashboardState {
  return normalizeDashboardState({});
}

export function addReservation(state: DashboardState, id: string, userId = "alice") {
  state.reservations[id] = {
    id, userId, subdomain: id, createdAt: NOW, updatedAt: NOW, lastUsedAt: NOW,
  };
}

export function addHost(
  state: DashboardState,
  id: string,
  reservationId: string,
  kind: "default" | "custom" = "custom",
  userId = "alice",
) {
  state.accessHosts[id] = {
    id, userId, reservationId, hostname: `${id}.${reservationId}`, kind,
    createdAt: NOW, updatedAt: NOW, lastSeenAt: NOW,
  };
}

export function addClaim(
  state: DashboardState,
  id: string,
  reservationId: string,
  connected: boolean,
  claimedAt = NOW,
) {
  state.devices[id] = {
    id, userId: "alice", name: `${id} device`, hostname: `${id}.local`,
    platform: "linux", fingerprint: id, createdAt: NOW, updatedAt: NOW, lastSeenAt: NOW,
  };
  state.deviceTunnels[id] = {
    id, userId: "alice", deviceId: id, localPort: 3000,
    reservationId, subdomain: reservationId, claimedAt, updatedAt: NOW,
  };
  if (connected) {
    state.deviceConnections[id] = { deviceId: id, connectedAt: NOW };
  }
}

export function makeStats(): RequestStatsRecord {
  const counts = { "192.0.2.3": 2, "192.0.2.2": 3, "192.0.2.1": 3 };
  return {
    requestCount: 8, firstRequestAt: EARLIER, lastRequestAt: NOW,
    ipAddresses: Object.fromEntries(Object.entries(counts).map(([ipAddress, requestCount]) =>
      [ipAddress, { ipAddress, requestCount, firstSeenAt: EARLIER, lastSeenAt: NOW }])),
  };
}
