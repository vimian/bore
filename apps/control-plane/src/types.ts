export interface UserRecord {
  id: string;
  email: string;
  name: string;
  reservationLimit: number;
  accessHostLimit: number;
  createdAt: string;
  updatedAt: string;
}

export type AccessHostKind = "default" | "custom";

export interface RequestIpStatsRecord {
  ipAddress: string;
  requestCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface RequestStatsRecord {
  requestCount: number;
  firstRequestAt: string;
  lastRequestAt: string;
  ipAddresses: Record<string, RequestIpStatsRecord>;
}

export interface DeviceRecord {
  id: string;
  userId: string;
  name: string;
  hostname: string;
  platform: string;
  fingerprint: string;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
}

export interface TunnelReservationRecord {
  id: string;
  userId: string;
  subdomain: string;
  directRequestStats?: RequestStatsRecord;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string;
}

export interface DeviceTunnelRecord {
  id: string;
  userId: string;
  deviceId: string;
  localPort: number;
  reservationId: string;
  subdomain: string;
  claimedAt: string;
  updatedAt: string;
}

export interface AccessHostRecord {
  id: string;
  userId: string;
  reservationId: string;
  hostname: string;
  kind: AccessHostKind;
  requestStats?: RequestStatsRecord;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
}

export interface PendingCliAuthRecord {
  id: string;
  callbackUrl: string;
  clientState: string;
  deviceName: string;
  createdAt: string;
  expiresAt: string;
}

export interface DeviceConnectionRecord {
  deviceId: string;
  connectedAt: string;
}

export interface PersistedState {
  users: Record<string, UserRecord>;
  devices: Record<string, DeviceRecord>;
  reservations: Record<string, TunnelReservationRecord>;
  accessHosts: Record<string, AccessHostRecord>;
  deviceTunnels: Record<string, DeviceTunnelRecord>;
  pendingCliAuth: Record<string, PendingCliAuthRecord>;
  deviceConnections: Record<string, DeviceConnectionRecord>;
}

export interface DeviceRegistrationInput {
  deviceId: string;
  name: string;
  hostname: string;
  platform: string;
  fingerprint: string;
}

export interface DesiredTunnelInput {
  localPort: number;
  preferredSubdomain?: string;
  allocateNewSubdomain?: boolean;
}

export type TunnelStatus = "active" | "blocked" | "offline";

export interface TunnelView {
  deviceId: string;
  deviceName: string;
  hostname: string;
  platform: string;
  localPort: number;
  subdomain: string;
  publicUrl: string;
  status: TunnelStatus;
  claimedAt: string;
  updatedAt: string;
  lastSeenAt: string;
}

export interface SyncResponse {
  deviceId: string;
  tunnels: TunnelView[];
  reusableSubdomains: string[];
}

export interface RelayRequestMessage {
  type: "proxy_request";
  requestId: string;
  localPort: number;
  method: string;
  path: string;
  headers: Record<string, string[]>;
  body: string;
}

export interface RelayResponseMessage {
  type: "proxy_response";
  requestId: string;
  status: number;
  headers: Record<string, string[]>;
  body: string;
}

export interface WebSocketConnectMessage {
  type: "websocket_connect";
  connectionId: string;
  localPort: number;
  path: string;
  headers: Record<string, string[]>;
  protocols: string[];
}

export interface WebSocketConnectedMessage {
  type: "websocket_connected";
  connectionId: string;
  protocol?: string;
}

export interface WebSocketConnectErrorMessage {
  type: "websocket_connect_error";
  connectionId: string;
  message: string;
}

export interface WebSocketDataMessage {
  type: "websocket_data";
  connectionId: string;
  data: string;
  isBinary: boolean;
}

export interface WebSocketCloseMessage {
  type: "websocket_close";
  connectionId: string;
  code?: number;
  reason?: string;
}

export interface ClientHelloMessage {
  type: "hello";
  deviceId: string;
}

export type RelayMessage =
  | RelayRequestMessage
  | RelayResponseMessage
  | WebSocketConnectMessage
  | WebSocketConnectedMessage
  | WebSocketConnectErrorMessage
  | WebSocketDataMessage
  | WebSocketCloseMessage
  | ClientHelloMessage;

