import { randomUUID } from "node:crypto";

import {
  readSnapshot,
  upsertUser,
  writeSnapshot,
} from "./bore-db.js";
import {
  DEFAULT_ACCESS_HOST_LIMIT,
  DEFAULT_RESERVATION_LIMIT,
  emptyState,
} from "./state-model.js";
import type {
  DeviceConnectionRecord,
  PendingCliAuthRecord,
  PersistedState,
  UserRecord,
} from "./types.js";

export { DEFAULT_RESERVATION_LIMIT, emptyState };
export { DEFAULT_ACCESS_HOST_LIMIT };

export interface ControlPlaneStore {
  init(): Promise<void>;
  snapshot(): PersistedState;
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
    id: randomUUID(),
    callbackUrl: input.callbackUrl,
    clientState: input.clientState,
    deviceName: input.deviceName,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
  };
}

export function clearDeviceConnections(state: PersistedState): void {
  state.deviceConnections = {};
}

export function setDeviceConnection(
  state: PersistedState,
  deviceId: string,
  connectedAt?: string,
): DeviceConnectionRecord | undefined {
  if (!connectedAt) {
    delete state.deviceConnections[deviceId];
    return undefined;
  }

  const record: DeviceConnectionRecord = { deviceId, connectedAt };
  state.deviceConnections[deviceId] = record;
  return record;
}

export class SQLiteStore implements ControlPlaneStore {
  constructor(private readonly dbPath?: string) {}

  async init(): Promise<void> {
    const snapshot = readSnapshot(this.dbPath);

    if (Object.keys(snapshot.users).length === 0) {
      writeSnapshot(emptyState(), this.dbPath);
    }
  }

  snapshot(): PersistedState {
    return structuredClone(readSnapshot(this.dbPath));
  }

  async update<T>(updater: (state: PersistedState) => T | Promise<T>): Promise<T> {
    const state = this.snapshot();
    const result = await updater(state);
    writeSnapshot(state, this.dbPath);
    return result;
  }

  async upsertUser(input: {
    id?: string;
    email: string;
    name?: string;
    reservationLimit?: number;
    accessHostLimit?: number;
  }): Promise<UserRecord> {
    return upsertUser(input, this.dbPath);
  }

  async createPendingCliAuth(input: {
    callbackUrl: string;
    clientState: string;
    deviceName: string;
  }): Promise<PendingCliAuthRecord> {
    return this.update((state) => {
      const pending = createPendingCliAuthRecord(input);
      state.pendingCliAuth[pending.id] = pending;
      return pending;
    });
  }

  async consumePendingCliAuth(id: string): Promise<PendingCliAuthRecord | undefined> {
    return this.update((state) => {
      const pending = state.pendingCliAuth[id];

      if (!pending) {
        return undefined;
      }

      delete state.pendingCliAuth[id];
      return pending;
    });
  }

  async clearDeviceConnections(): Promise<void> {
    await this.update((state) => {
      clearDeviceConnections(state);
    });
  }
}
