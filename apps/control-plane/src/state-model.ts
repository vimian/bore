import type {
  AccessHostKind,
  DeviceTunnelRecord,
  PersistedState,
  RequestStatsRecord,
  UserRecord,
} from "./types.js";

export const CONTROL_PLANE_STATE_KEY = "primary";
export const DEFAULT_RESERVATION_LIMIT = 2;
export const DEFAULT_ACCESS_HOST_LIMIT = 5;

export type ReservationStatus = "active" | "blocked" | "offline" | "available";

export interface ReservationClaimView {
  tunnelId: string;
  deviceId: string;
  deviceName: string;
  hostname: string;
  platform: string;
  localPort: number;
  status: "active" | "blocked" | "offline";
  claimedAt: string;
  updatedAt: string;
  lastSeenAt: string;
}

export interface AccessHostView {
  accessHostId: string;
  label: string;
  hostname: string;
  publicUrl: string;
  kind: AccessHostKind;
  requestStats: RequestStatsView;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
}

export interface RequestIpStatsView {
  ipAddress: string;
  requestCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface RequestStatsView {
  requestCount: number;
  uniqueIpCount: number;
  firstRequestAt?: string;
  lastRequestAt?: string;
  ipAddresses: RequestIpStatsView[];
}

export interface ReservationView {
  reservationId: string;
  subdomain: string;
  publicUrl: string;
  lastUsedAt: string;
  status: ReservationStatus;
  directRequestStats: RequestStatsView;
  accessHosts: AccessHostView[];
  claims: ReservationClaimView[];
}

export interface DashboardOverview {
  user: {
    id: string;
    email: string;
    name: string;
    reservationLimit: number;
    accessHostLimit: number;
    reservedNamespaceCount: number;
    accessHostCount: number;
    remainingNamespaceSlots: number;
    remainingAccessHostSlots: number;
  };
  namespaces: ReservationView[];
}

export function emptyState(): PersistedState {
  return {
    users: {},
    devices: {},
    reservations: {},
    accessHosts: {},
    deviceTunnels: {},
    pendingCliAuth: {},
    deviceConnections: {},
  };
}

export function getTunnelStatus(
  state: PersistedState,
  tunnel: DeviceTunnelRecord,
): "active" | "blocked" | "offline" {
  if (!state.deviceConnections[tunnel.deviceId]) {
    return "offline";
  }

  const onlineClaims = Object.values(state.deviceTunnels)
    .filter(
      (candidate) =>
        candidate.userId === tunnel.userId &&
        candidate.subdomain === tunnel.subdomain &&
        Boolean(state.deviceConnections[candidate.deviceId]),
    )
    .sort(
      (left, right) =>
        right.claimedAt.localeCompare(left.claimedAt) ||
        right.updatedAt.localeCompare(left.updatedAt),
    );

  const winner = onlineClaims[0];

  if (!winner) {
    return "offline";
  }

  return winner.id === tunnel.id ? "active" : "blocked";
}

export function buildRequestStatsView(
  stats?: RequestStatsRecord,
): RequestStatsView {
  if (!stats) {
    return {
      requestCount: 0,
      uniqueIpCount: 0,
      ipAddresses: [],
    };
  }

  const ipAddresses = Object.values(stats.ipAddresses)
    .sort(
      (left, right) =>
        right.requestCount - left.requestCount ||
        left.ipAddress.localeCompare(right.ipAddress),
    )
    .map((entry) => ({
      ipAddress: entry.ipAddress,
      requestCount: entry.requestCount,
      firstSeenAt: entry.firstSeenAt,
      lastSeenAt: entry.lastSeenAt,
    }));

  return {
    requestCount: stats.requestCount,
    uniqueIpCount: ipAddresses.length,
    firstRequestAt: stats.firstRequestAt,
    lastRequestAt: stats.lastRequestAt,
    ipAddresses,
  };
}

export function buildDashboardOverview(
  state: PersistedState,
  user: UserRecord,
  publicDomain: string,
): DashboardOverview {
  const namespaces = Object.values(state.reservations)
    .filter((reservation) => reservation.userId === user.id)
    .sort((left, right) => left.subdomain.localeCompare(right.subdomain))
    .map((reservation) => {
      const accessHosts = Object.values(state.accessHosts)
        .filter((accessHost) => accessHost.reservationId === reservation.id)
        .map((accessHost) => {
          const suffix = `.${reservation.subdomain}`;
          const label = accessHost.hostname.endsWith(suffix)
            ? accessHost.hostname.slice(0, -suffix.length)
            : accessHost.hostname;

          return {
            accessHostId: accessHost.id,
            label,
            hostname: accessHost.hostname,
            publicUrl: `https://${accessHost.hostname}.${publicDomain}`,
            kind: accessHost.kind ?? "custom",
            requestStats: buildRequestStatsView(accessHost.requestStats),
            createdAt: accessHost.createdAt,
            updatedAt: accessHost.updatedAt,
            lastSeenAt: accessHost.lastSeenAt,
          } satisfies AccessHostView;
        })
        .sort(
          (left, right) =>
            left.label.localeCompare(right.label) || left.hostname.localeCompare(right.hostname),
        );
      const claims = Object.values(state.deviceTunnels)
        .filter((tunnel) => tunnel.reservationId === reservation.id)
        .map((tunnel) => {
          const device = state.devices[tunnel.deviceId];

          if (!device) {
            return undefined;
          }

          return {
            tunnelId: tunnel.id,
            deviceId: tunnel.deviceId,
            deviceName: device.name,
            hostname: device.hostname,
            platform: device.platform,
            localPort: tunnel.localPort,
            status: getTunnelStatus(state, tunnel),
            claimedAt: tunnel.claimedAt,
            updatedAt: tunnel.updatedAt,
            lastSeenAt: device.lastSeenAt,
          } satisfies ReservationClaimView;
        })
        .filter((claim): claim is ReservationClaimView => claim !== undefined)
        .sort(
          (left, right) =>
            right.claimedAt.localeCompare(left.claimedAt) ||
            right.updatedAt.localeCompare(left.updatedAt),
        );

      const status =
        claims.find((claim) => claim.status === "active")?.status ??
        claims.find((claim) => claim.status === "blocked")?.status ??
        claims.find((claim) => claim.status === "offline")?.status ??
        "available";

      return {
        reservationId: reservation.id,
        subdomain: reservation.subdomain,
        publicUrl: `https://${reservation.subdomain}.${publicDomain}`,
        lastUsedAt: reservation.lastUsedAt,
        status,
        directRequestStats: buildRequestStatsView(reservation.directRequestStats),
        accessHosts,
        claims,
      } satisfies ReservationView;
    });

  const reservedNamespaceCount = namespaces.length;
  const reservationLimit = user.reservationLimit ?? DEFAULT_RESERVATION_LIMIT;
  const accessHostCount = Object.values(state.accessHosts).filter(
    (accessHost) => accessHost.userId === user.id && (accessHost.kind ?? "custom") === "custom",
  ).length;
  const accessHostLimit = user.accessHostLimit ?? DEFAULT_ACCESS_HOST_LIMIT;

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      reservationLimit,
      accessHostLimit,
      reservedNamespaceCount,
      accessHostCount,
      remainingNamespaceSlots: Math.max(reservationLimit - reservedNamespaceCount, 0),
      remainingAccessHostSlots: Math.max(accessHostLimit - accessHostCount, 0),
    },
    namespaces,
  };
}
