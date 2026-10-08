import type * as SQLiteDatabase from "./sqlite-db.js";
import {
  emptyState,
  createPendingCliAuthRecord,
  clearDeviceConnections,
  type ControlPlaneStore,
} from "./store-contract.js";
import type {
  PendingCliAuthRecord,
  PersistedState,
  UserRecord,
} from "./types.js";
import type { TrafficUpdate } from "./traffic-history.js";

export * from "./store-contract.js";

export class SQLiteStore implements ControlPlaneStore {
  #updates: Promise<unknown> = Promise.resolve();
  #routing?: { revision: string; state: PersistedState };
  #database!: typeof SQLiteDatabase;
  constructor(private readonly dbPath?: string) {}

  async init(): Promise<void> {
    this.#database = await import("./sqlite-db.js");
    const snapshot = this.#database.readSnapshot(this.dbPath, false);

    if (Object.keys(snapshot.users).length === 0) {
      this.#database.writeSnapshot(emptyState(), this.dbPath);
    }
  }

  snapshot(): PersistedState {
    return this.#database.readSnapshot(this.dbPath);
  }

  routingSnapshot(): PersistedState {
    const revision = this.#database.readStateRevision(this.dbPath);
    if (this.#routing?.revision !== revision) {
      const state = this.#database.readSnapshot(this.dbPath, false);
      state.users = {};
      state.pendingCliAuth = {};
      for (const reservation of Object.values(state.reservations)) delete reservation.directRequestStats;
      for (const host of Object.values(state.accessHosts)) delete host.requestStats;
      this.#routing = { revision, state };
    }
    return structuredClone(this.#routing.state);
  }

  userSnapshot(userId: string): PersistedState { return this.#database.readUserSnapshot(userId, this.dbPath); }
  async recordTraffic(entries: TrafficUpdate[]): Promise<void> {
    return this.#enqueue(() => { this.#database.recordTraffic(entries, this.dbPath); this.#routing = undefined; });
  }
  async clearRequestStats(kind: string, id: string): Promise<void> {
    return this.#enqueue(() => { this.#database.clearRequestStats(kind, id, this.dbPath); });
  }

  #enqueue<T>(operation: () => T | Promise<T>): Promise<T> {
    const update = this.#updates.then(operation);
    this.#updates = update.catch(() => undefined);
    return update;
  }

  async update<T>(updater: (state: PersistedState) => T | Promise<T>): Promise<T> {
    return this.#enqueue(async () => {
      const state = this.#database.readSnapshot(this.dbPath, false);
      const result = await updater(state);
      this.#database.writeSnapshot(state, this.dbPath, true);
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
    return this.#database.upsertUser(input, this.dbPath);
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
