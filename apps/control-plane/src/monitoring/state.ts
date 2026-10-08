import type { DatabaseSync } from "node:sqlite";
import { ensureSchema, readState } from "@bore/database";
import type { PersistedState } from "../types.js";

export function monitoringStateReader(path: string, databaseUrl: string | undefined) {
  let db: DatabaseSync | undefined;
  let initialized = false;
  return {
    async read(): Promise<{ state: PersistedState; stateBytes: number }> {
      if (!databaseUrl) {
        if (!db) {
          const { DatabaseSync } = await import("node:sqlite");
          db ??= new DatabaseSync(path, { readOnly: true });
        }
        const row = db.prepare("SELECT value FROM app_state WHERE key=?").get("primary") as { value: string } | undefined;
        if (!row) throw new Error("Primary state is missing");
        return { state: JSON.parse(row.value) as PersistedState, stateBytes: Buffer.byteLength(row.value) };
      }
      if (!initialized) { await ensureSchema(); initialized = true; }
      const row = await readState<PersistedState>();
      return { state: row.value, stateBytes: Buffer.byteLength(JSON.stringify(row.value)) };
    },
    close(): void { db?.close(); },
  };
}
