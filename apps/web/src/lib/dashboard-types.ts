import type { UserRecord } from "@bore/database";

export type AccessHostKind = "default" | "custom";
export type TunnelStatus = "active" | "blocked" | "offline";
export type NamespaceStatus = TunnelStatus | "available";

export type RequestIpStatsRecord = {
  ipAddress: string;
  requestCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type RequestStatsRecord = {
  requestCount: number;
  firstRequestAt: string;
  lastRequestAt: string;
  ipAddresses: Record<string, RequestIpStatsRecord>;
};

export type RequestStatsView = {
  requestCount: number;
  uniqueIpCount: number;
  firstRequestAt?: string;
  lastRequestAt?: string;
  ipAddresses: RequestIpStatsRecord[];
};

export type DashboardState = {
  devices: Record<string, {
    id: string;
    userId: string;
    name: string;
    hostname: string;
    platform: string;
    fingerprint: string;
    createdAt: string;
    updatedAt: string;
    lastSeenAt: string;
  }>;
  reservations: Record<string, {
    id: string;
    userId: string;
    subdomain: string;
    directRequestStats?: RequestStatsRecord;
    createdAt: string;
    updatedAt: string;
    lastUsedAt: string;
  }>;
  accessHosts: Record<string, {
    id: string;
    userId: string;
    reservationId: string;
    hostname: string;
    kind: AccessHostKind;
    requestStats?: RequestStatsRecord;
    createdAt: string;
    updatedAt: string;
    lastSeenAt: string;
  }>;
  deviceTunnels: Record<string, {
    id: string;
    userId: string;
    deviceId: string;
    localPort: number;
    reservationId: string;
    subdomain: string;
    claimedAt: string;
    updatedAt: string;
  }>;
  deviceConnections: Record<string, { deviceId: string; connectedAt: string }>;
};

export type DashboardOverview = {
  user: Pick<UserRecord, "id" | "email" | "name" | "reservationLimit" | "accessHostLimit"> & {
    reservedNamespaceCount: number;
    accessHostCount: number;
    remainingNamespaceSlots: number;
    remainingAccessHostSlots: number;
  };
  namespaces: Array<{
    reservationId: string;
    subdomain: string;
    publicUrl: string;
    lastUsedAt: string;
    status: NamespaceStatus;
    directRequestStats: RequestStatsView;
    accessHosts: Array<{
      accessHostId: string;
      label: string;
      hostname: string;
      publicUrl: string;
      kind: AccessHostKind;
      requestStats: RequestStatsView;
      createdAt: string;
      updatedAt: string;
      lastSeenAt: string;
    }>;
    claims: Array<{
      tunnelId: string;
      deviceId: string;
      deviceName: string;
      hostname: string;
      platform: string;
      localPort: number;
      status: TunnelStatus;
      claimedAt: string;
      updatedAt: string;
      lastSeenAt: string;
    }>;
  }>;
};
