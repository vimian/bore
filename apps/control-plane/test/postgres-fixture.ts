import { randomUUID } from "node:crypto";
import { query } from "@bore/database";
import { PostgreSQLStore } from "../src/postgres-store.js";
import { TunnelCoordinator } from "../src/tunnel-coordinator.js";

export const postgresEnabled = Boolean(process.env.TEST_DATABASE_URL);
if (postgresEnabled) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

export async function postgresFixture() {
  const prefix = `pg-${randomUUID()}`;
  const store = new PostgreSQLStore();
  const other = new PostgreSQLStore();
  await store.init();
  await other.init();
  const user = await store.upsertUser({ id: prefix, email: `${prefix}@example.com`, reservationLimit: 20, accessHostLimit: 20 });
  const coordinator = new TunnelCoordinator(store, "example.com");
  const deviceId = `${prefix}-device`;
  await coordinator.registerDevice(user.id, { deviceId, name: "PG test", hostname: "test", platform: "linux", fingerprint: prefix });
  return { prefix, user, store, other, coordinator, deviceId, async close() {
    try {
      await store.update((state) => {
        for (const record of Object.values(state.reservations)) if (record.userId === user.id) delete state.reservations[record.id];
        for (const record of Object.values(state.accessHosts)) if (record.userId === user.id) delete state.accessHosts[record.id];
        for (const record of Object.values(state.deviceTunnels)) if (record.userId === user.id) delete state.deviceTunnels[record.id];
        for (const key of Object.keys(state.deviceConnections)) if (key.startsWith(prefix)) delete state.deviceConnections[key];
        for (const record of Object.values(state.devices)) if (record.userId === user.id) delete state.devices[record.id];
      });
      await query("DELETE FROM users WHERE id=$1", [user.id]);
    } finally { await store.close(); await other.close(); }
  } };
}
