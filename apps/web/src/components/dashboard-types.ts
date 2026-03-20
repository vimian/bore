import type { DashboardOverview } from "@/lib/bore-db";

export type Claim = {
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
};

export type RequestStats = {
  requestCount: number;
  uniqueIpCount: number;
  firstRequestAt?: string;
  lastRequestAt?: string;
  ipAddresses: Array<{
    ipAddress: string;
    requestCount: number;
    firstSeenAt: string;
    lastSeenAt: string;
  }>;
};

export type AccessHost = {
  accessHostId: string;
  label: string;
  hostname: string;
  publicUrl: string;
  kind: "default" | "custom";
  requestStats: RequestStats;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
};

export type Namespace = {
  reservationId: string;
  subdomain: string;
  publicUrl: string;
  lastUsedAt: string;
  status: "active" | "blocked" | "offline" | "available";
  directRequestStats: RequestStats;
  accessHosts: AccessHost[];
  claims: Claim[];
};

export type TrafficTarget =
  | {
      scope: "direct";
      subdomain: string;
    }
  | {
      scope: "child";
      subdomain: string;
      accessHostId: string;
      label: string;
      hostname: string;
    };

export function getTrafficTargetKey(target: TrafficTarget): string {
  return target.scope === "direct"
    ? `direct:${target.subdomain}`
    : `child:${target.accessHostId}`;
}

export type Overview = DashboardOverview & {
  namespaces: Namespace[];
};
