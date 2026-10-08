import { randomUUID } from "node:crypto";
import type { DeviceConnectionRecord, PendingCliAuthRecord, PersistedState, UserRecord } from "./types.js";
import type { TrafficUpdate } from "./traffic-history.js";

export { DEFAULT_ACCESS_HOST_LIMIT, DEFAULT_RESERVATION_LIMIT, emptyState } from "./state-model.js";

export interface ControlPlaneStore {
  init(): Promise<void>;
  snapshot(): PersistedState;
  routingSnapshot?(): PersistedState;
  userSnapshot?(userId: string): PersistedState | Promise<PersistedState>;
  ready?(): boolean;
  close?(): Promise<void>;
  recordTraffic?(entries: TrafficUpdate[]): Promise<void>;
  clearRequestStats?(kind: string, id: string): Promise<void>;
  update<T>(updater: (state: PersistedState) => T | Promise<T>): Promise<T>;
  upsertUser(input: {
    id?: string;
    email: string;
    name?: string;
    reservationLimit?: number;
    accessHostLimit?: number;
  }): Promise<UserRecord>;
  createPendingCliAuth(input: {
    callbackUrl: string;
    clientState: string;
    deviceName: string;
  }): Promise<PendingCliAuthRecord>;
  consumePendingCliAuth(id: string): Promise<PendingCliAuthRecord | undefined>;
  clearDeviceConnections(): Promise<void>;
}

export function createPendingCliAuthRecord(input: {
  callbackUrl: string;
  clientState: string;
  deviceName: string;
}): PendingCliAuthRecord {
  const now = new Date();
  return {
    id: randomUUID(), ...input, createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
  };
}

export function clearDeviceConnections(state: PersistedState): void { state.deviceConnections = {}; }

export function setDeviceConnection(state: PersistedState, deviceId: string, connectedAt?: string): DeviceConnectionRecord | undefined {
  if (!connectedAt) {
    delete state.deviceConnections[deviceId];
    return undefined;
  }
  const record = { deviceId, connectedAt };
  state.deviceConnections[deviceId] = record;
  return record;
}
