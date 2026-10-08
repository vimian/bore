import type { UserRecord } from "@bore/database";
import type {
  DashboardOverview, DashboardState, NamespaceStatus, RequestStatsRecord,
  RequestStatsView, TunnelStatus,
} from "./dashboard-types";

const DEFAULT_ACCESS_HOST_LIMIT = 5;

function getTunnelStatus(
  state: DashboardState,
  tunnel: DashboardState["deviceTunnels"][string],
): TunnelStatus {
  if (!state.deviceConnections[tunnel.deviceId]) {
    return "offline";
  }
  const onlineClaims = Object.values(state.deviceTunnels)
    .filter((candidate) =>
      candidate.userId === tunnel.userId && candidate.subdomain === tunnel.subdomain &&
      Boolean(state.deviceConnections[candidate.deviceId]))
    .sort((left, right) =>
      right.claimedAt.localeCompare(left.claimedAt) || right.updatedAt.localeCompare(left.updatedAt));
  const winner = onlineClaims[0];
  return winner ? (winner.id === tunnel.id ? "active" : "blocked") : "offline";
}

function buildRequestStatsView(stats?: RequestStatsRecord): RequestStatsView {
  if (!stats) {
    return { requestCount: 0, uniqueIpCount: 0, ipAddresses: [] };
  }
  const ipAddresses = Object.values(stats.ipAddresses)
    .sort((left, right) =>
      right.requestCount - left.requestCount || left.ipAddress.localeCompare(right.ipAddress))
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
  state: DashboardState,
  user: UserRecord,
  publicDomain: string,
): DashboardOverview {
  const namespaces = Object.values(state.reservations)
    .filter((reservation) => reservation.userId === user.id)
    .sort((left, right) => left.subdomain.localeCompare(right.subdomain))
    .map((reservation) => {
      const accessHosts = Object.values(state.accessHosts)
        .filter((host) => host.reservationId === reservation.id)
        .map((host) => {
          const suffix = `.${reservation.subdomain}`;
          const label = host.hostname.endsWith(suffix)
            ? host.hostname.slice(0, -suffix.length) : host.hostname;
          return {
            accessHostId: host.id,
            label,
            hostname: host.hostname,
            publicUrl: `https://${host.hostname}.${publicDomain}`,
            kind: host.kind ?? "custom",
            requestStats: buildRequestStatsView(host.requestStats),
            createdAt: host.createdAt,
            updatedAt: host.updatedAt,
            lastSeenAt: host.lastSeenAt,
          };
        })
        .sort((left, right) =>
          left.label.localeCompare(right.label) || left.hostname.localeCompare(right.hostname));
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
          };
        })
        .filter((claim): claim is NonNullable<typeof claim> => claim !== undefined)
        .sort((left, right) =>
          right.claimedAt.localeCompare(left.claimedAt) || right.updatedAt.localeCompare(left.updatedAt));
      const status: NamespaceStatus =
        claims.find((claim) => claim.status === "active")?.status ??
        claims.find((claim) => claim.status === "blocked")?.status ??
        claims.find((claim) => claim.status === "offline")?.status ?? "available";
      return {
        reservationId: reservation.id,
        subdomain: reservation.subdomain,
        publicUrl: `https://${reservation.subdomain}.${publicDomain}`,
        lastUsedAt: reservation.lastUsedAt,
        status,
        directRequestStats: buildRequestStatsView(reservation.directRequestStats),
        accessHosts,
        claims,
      };
    });
  const accessHostCount = Object.values(state.accessHosts).filter((host) =>
    host.userId === user.id && (host.kind ?? "custom") === "custom").length;
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      reservationLimit: user.reservationLimit,
      accessHostLimit: user.accessHostLimit ?? DEFAULT_ACCESS_HOST_LIMIT,
      reservedNamespaceCount: namespaces.length,
      accessHostCount,
      remainingNamespaceSlots: Math.max(user.reservationLimit - namespaces.length, 0),
      remainingAccessHostSlots: Math.max(
        (user.accessHostLimit ?? DEFAULT_ACCESS_HOST_LIMIT) - accessHostCount, 0),
    },
    namespaces,
  };
}
