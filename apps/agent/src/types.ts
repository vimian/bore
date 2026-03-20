export interface DesiredTunnelConfig {
  localPort: number;
  preferredSubdomain?: string;
  allocateNewSubdomain?: boolean;
}

export interface NamespaceAccessHostView {
  accessHostId: string;
  label: string;
  hostname: string;
  publicUrl: string;
  kind: "default" | "custom";
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
}

export interface NamespaceClaimView {
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

export interface NamespaceView {
  reservationId: string;
  subdomain: string;
  publicUrl: string;
  lastUsedAt: string;
  status: "active" | "blocked" | "offline" | "available";
  accessHosts: NamespaceAccessHostView[];
  claims: NamespaceClaimView[];
}

export interface NamespaceReleaseResponse {
  releasedSubdomain: string;
  removedAccessHostnames: string[];
}

export interface AgentConfig {
  serverOrigin: string;
  token?: string;
  userEmail?: string;
  deviceId: string;
  deviceName: string;
  desiredTunnels: DesiredTunnelConfig[];
  autostartInstalled?: boolean;
}

export interface RuntimeState {
  controlPort?: number;
  daemonPid?: number;
  lastSyncAt?: string;
  lastError?: string;
  tunnels?: TunnelView[];
}

export interface MeResponse {
  id: string;
  email: string;
  name: string;
}

export interface TunnelView {
  deviceId: string;
  deviceName: string;
  hostname: string;
  platform: string;
  localPort: number;
  subdomain: string;
  publicUrl: string;
  status: "active" | "blocked" | "offline";
  claimedAt: string;
  updatedAt: string;
  lastSeenAt: string;
}

export interface SyncResponse {
  deviceId: string;
  tunnels: TunnelView[];
  reusableSubdomains: string[];
  namespaces: NamespaceView[];
}
