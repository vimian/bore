import { randomUUID } from "node:crypto";

import {
  readSnapshot,
  readStateRevision,
  readUserSnapshot,
  recordTraffic,
  clearRequestStats,
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
import type { TrafficUpdate } from "./traffic-history.js";

export { DEFAULT_RESERVATION_LIMIT, emptyState };
export { DEFAULT_ACCESS_HOST_LIMIT };

export interface ControlPlaneStore {
  init(): Promise<void>;
  snapshot(): PersistedState;
  routingSnapshot?(): PersistedState;
  userSnapshot?(userId: string): PersistedState;
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
  #updates: Promise<unknown> = Promise.resolve();
  #routing?: { revision: string; state: PersistedState };
  constructor(private readonly dbPath?: string) {}

  async init(): Promise<void> {
    const snapshot = readSnapshot(this.dbPath, false);

    if (Object.keys(snapshot.users).length === 0) {
      writeSnapshot(emptyState(), this.dbPath);
    }
  }

  snapshot(): PersistedState {
    return readSnapshot(this.dbPath);
  }

  routingSnapshot(): PersistedState {
    const revision = readStateRevision(this.dbPath);
    if (this.#routing?.revision !== revision) {
      const state = readSnapshot(this.dbPath, false);
      state.users = {};
      state.pendingCliAuth = {};
      for (const reservation of Object.values(state.reservations)) delete reservation.directRequestStats;
      for (const host of Object.values(state.accessHosts)) delete host.requestStats;
      this.#routing = { revision, state };
    }
    return structuredClone(this.#routing.state);
  }

  userSnapshot(userId: string): PersistedState { return readUserSnapshot(userId, this.dbPath); }
  async recordTraffic(entries: TrafficUpdate[]): Promise<void> {
    return this.#enqueue(() => { recordTraffic(entries, this.dbPath); this.#routing = undefined; });
  }
  async clearRequestStats(kind: string, id: string): Promise<void> {
    return this.#enqueue(() => { clearRequestStats(kind, id, this.dbPath); });
  }

  #enqueue<T>(operation: () => T | Promise<T>): Promise<T> {
    const update = this.#updates.then(operation);
    this.#updates = update.catch(() => undefined);
    return update;
  }

  async update<T>(updater: (state: PersistedState) => T | Promise<T>): Promise<T> {
    return this.#enqueue(async () => {
      const state = readSnapshot(this.dbPath, false);
      const result = await updater(state);
      writeSnapshot(state, this.dbPath, true);
      this.#routing = undefined;
      return result;
    });
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
