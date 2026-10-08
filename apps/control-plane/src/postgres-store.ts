import { ensureSchema, readState, readTraffic, listUsers, transaction, upsertUser } from "@bore/database";
import { emptyState } from "./state-model.js";
import { createPendingCliAuthRecord, clearDeviceConnections, type ControlPlaneStore } from "./store-contract.js";
import { withoutTrafficHistory, type TrafficUpdate } from "./traffic-history.js";
import { pruneTraffic, writeTraffic, type PostgreSQLClient } from "./postgres-traffic.js";
import { UserFacingError } from "./errors.js";
import type { PendingCliAuthRecord, PersistedState, RequestStatsRecord, UserRecord } from "./types.js";

type StateRow = { value: PersistedState; revision: string };
type UserRow = { id: string; email: string; name: string; reservation_limit: number;
  access_host_limit: number; created_at: string; updated_at: string };

function metadata(value: Partial<PersistedState>): PersistedState {
  return withoutTrafficHistory({ ...emptyState(), ...value, users: {} });
}

async function lockState(client: PostgreSQLClient): Promise<StateRow> {
  const { rows } = await client.query<StateRow>("SELECT value,revision::text FROM app_state WHERE key='primary' FOR UPDATE");
  if (!rows[0]) throw new Error("PostgreSQL control-plane state is missing");
  return { value: metadata(rows[0].value), revision: rows[0].revision };
}

async function saveState(client: PostgreSQLClient, value: PersistedState): Promise<StateRow> {
  const state = metadata(value);
  const { users: _users, ...stored } = state;
  const { rows } = await client.query<{ revision: string }>(
    "UPDATE app_state SET value=$1::jsonb,updated_at=$2,revision=revision+1 WHERE key='primary' RETURNING revision::text",
    [JSON.stringify(stored), new Date().toISOString()],
  );
  return { value: state, revision: rows[0]!.revision };
}

export class PostgreSQLStore implements ControlPlaneStore {
  #state = emptyState();
  #revision = "";
  #ready = false;
  #lastSuccess = 0;
  #closed = false;
  #queued = 0;
  #updates: Promise<unknown> = Promise.resolve();
  #timer?: NodeJS.Timeout;
  #refreshQueued = false;

  async init(): Promise<void> {
    await ensureSchema();
    await this.refresh();
    this.#timer = setInterval(() => {
      if (this.#refreshQueued || this.#closed) return;
      this.#refreshQueued = true;
      void this.refresh().catch((error) => console.error("PostgreSQL state refresh failed", error))
        .finally(() => { this.#refreshQueued = false; });
    }, 5000);
    this.#timer.unref();
  }

  ready(): boolean { return this.#ready && !this.#closed && Date.now() - this.#lastSuccess < 15_000; }
  snapshot(): PersistedState { return structuredClone(this.#state); }
  routingSnapshot(): PersistedState {
    const state = this.snapshot();
    state.pendingCliAuth = {};
    return state;
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    if (this.#closed) return Promise.reject(new Error("PostgreSQL store is closed"));
    if (this.#queued >= 256) return Promise.reject(new UserFacingError(503, "database_busy", "Control plane is busy; retry shortly"));
    this.#queued += 1;
    const result = this.#updates.then(operation).catch((error: unknown) => {
      if (!(error instanceof UserFacingError)) this.#ready = false;
      throw error;
    }).finally(() => { this.#queued -= 1; });
    this.#updates = result.catch(() => undefined);
    return result;
  }

  #publish(row: StateRow): void {
    this.#state = structuredClone(metadata(row.value));
    this.#revision = row.revision;
    this.#ready = true;
    this.#lastSuccess = Date.now();
  }

  async refresh(): Promise<void> {
    await this.#enqueue(async () => {
      const row = await readState<PersistedState>();
      if (row.revision !== this.#revision) this.#publish(row);
      else { this.#ready = true; this.#lastSuccess = Date.now(); }
    });
  }

  async userSnapshot(userId: string): Promise<PersistedState> {
    await this.refresh();
    const state = this.snapshot();
    const ids = [...Object.values(state.reservations), ...Object.values(state.accessHosts)]
      .filter((item) => item.userId === userId).map((item) => item.id);
    const [users, history] = await Promise.all([listUsers(), readTraffic(ids)]);
    state.users = Object.fromEntries(users.filter((user) => user.id === userId).map((user) => [user.id, user]));
    for (const row of history) {
      if (row.kind === "direct" && state.reservations[row.id]?.userId === userId)
        state.reservations[row.id]!.directRequestStats = row.value as RequestStatsRecord;
      if (row.kind === "child" && state.accessHosts[row.id]?.userId === userId)
        state.accessHosts[row.id]!.requestStats = row.value as RequestStatsRecord;
    }
    return state;
  }

  async update<T>(updater: (state: PersistedState) => T | Promise<T>): Promise<T> {
    return this.#enqueue(async () => {
      const committed = await transaction(async (client) => {
        const { value } = await lockState(client);
        const { rows } = await client.query<UserRow>("SELECT * FROM users");
        value.users = Object.fromEntries(rows.map((user) => [user.id, {
          id: user.id, email: user.email, name: user.name, reservationLimit: user.reservation_limit,
          accessHostLimit: user.access_host_limit, createdAt: user.created_at, updatedAt: user.updated_at,
        }]));
        const result = await updater(value);
        const row = await saveState(client, value);
        await pruneTraffic(client);
        return { row, result };
      });
      // Never publish speculative metadata: transaction() resolves only after COMMIT.
      this.#publish(committed.row);
      return committed.result;
    });
  }

  async recordTraffic(entries: TrafficUpdate[]): Promise<void> {
    if (!entries.length) return;
    await this.#enqueue(async () => {
      const row = await transaction(async (client) => {
        const current = await lockState(client);
        return await writeTraffic(client, current.value, entries) ? saveState(client, current.value) : current;
      });
      this.#publish(row);
    });
  }

  async clearRequestStats(kind: string, id: string): Promise<void> {
    await this.#enqueue(async () => {
      await transaction(async (client) => {
        await lockState(client);
        await client.query("DELETE FROM traffic_history WHERE kind=$1 AND id=$2", [kind, id]);
      });
    });
  }

  async upsertUser(input: Parameters<ControlPlaneStore["upsertUser"]>[0]): Promise<UserRecord> {
    return upsertUser(input);
  }
  async createPendingCliAuth(input: Parameters<ControlPlaneStore["createPendingCliAuth"]>[0]): Promise<PendingCliAuthRecord> {
    return this.update((state) => {
      const record = createPendingCliAuthRecord(input);
      state.pendingCliAuth[record.id] = record;
      return record;
    });
  }
  async consumePendingCliAuth(id: string): Promise<PendingCliAuthRecord | undefined> {
    return this.update((state) => {
      const record = state.pendingCliAuth[id];
      delete state.pendingCliAuth[id];
      return record;
    });
  }
  async clearDeviceConnections(): Promise<void> { await this.update(clearDeviceConnections); }
  async close(): Promise<void> {
    this.#closed = true;
    clearInterval(this.#timer);
    await this.#updates;
    this.#ready = false;
  }
}
