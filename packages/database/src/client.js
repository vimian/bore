import { readFileSync } from "node:fs";
import pg from "pg";

pg.types.setTypeParser(20, (value) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error("Database integer exceeds JavaScript's safe range");
  return number;
});

export function getPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be configured for PostgreSQL");
  if (!globalThis.__borePostgresPool) {
    const passwordFile = process.env.BORE_POSTGRES_PASSWORD_FILE;
    const connectionUrl = new URL(process.env.DATABASE_URL);
    if (passwordFile) {
      const password = readFileSync(passwordFile, "utf8").trim();
      // pg parses connectionString after the other config, so credentials must live in the URL.
      connectionUrl.password = encodeURIComponent(password);
      if (connectionUrl.searchParams.has("password")) connectionUrl.searchParams.set("password", password);
    }
    const pool = new pg.Pool({
      connectionString: connectionUrl.toString(),
      max: Number(process.env.BORE_DB_POOL_SIZE ?? 10),
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 10_000,
      lock_timeout: 5000,
      application_name: process.env.BORE_DB_APPLICATION_NAME ?? "bore",
      allowExitOnIdle: true,
    });
    pool.on("error", (error) => console.error("PostgreSQL idle connection error", error.code ?? "connection_error"));
    globalThis.__borePostgresPool = pool;
  }
  return globalThis.__borePostgresPool;
}

export function query(text, values = []) { return getPool().query(text, values); }

export async function transaction(operation) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export async function closeDatabase() {
  const pool = globalThis.__borePostgresPool;
  globalThis.__borePostgresPool = undefined;
  if (pool) await pool.end();
}
