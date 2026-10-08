import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { existsSync, mkdtempSync } from "node:fs";
import { createServer, request, type IncomingHttpHeaders } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";
import { closeDatabase, query } from "@bore/database";
import { SessionTokenService } from "../src/session-tokens.js";
import { postgresEnabled } from "./postgres-fixture.js";

after(async () => { if (postgresEnabled) await closeDatabase(); });
const entrypoint = fileURLToPath(new URL("../src/index.ts", import.meta.url));
const exited = (child: ChildProcess) => child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : once(child, "exit");

test("PostgreSQL store, coordinator and contract imports never load Node SQLite", async () => {
  const modules = ["postgres-store", "tunnel-coordinator", "store-contract"]
    .map((name) => fileURLToPath(new URL(`../src/${name}.ts`, import.meta.url)));
  const script = modules.map((path) => `await import(${JSON.stringify(path)})`).join(";");
  const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  let output = "";
  child.stderr.on("data", (data) => { output += data; });
  const [code] = await once(child, "exit");
  assert.equal(code, 0, output);
  assert.doesNotMatch(output, /SQLite/);
});

test("PostgreSQL server awaits session/signed authentication, namespace reads and browser approval; readiness fails and recovers", {
  skip: !postgresEnabled, timeout: 20_000,
}, async (t) => {
  // A private schema keeps server startup's connection reset away from other test fixtures.
  const schema = `server_${randomUUID().replaceAll("-", "")}`;
  await query(`CREATE SCHEMA "${schema}"`);
  const databaseUrl = new URL(process.env.TEST_DATABASE_URL!);
  databaseUrl.searchParams.set("options", `-csearch_path=${schema}`);
  const dbPath = join(mkdtempSync(join(tmpdir(), "bore-pg-server-")), "must-not-exist.sqlite");
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const address = listener.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  const child = spawn(process.execPath, ["--import", "tsx", entrypoint], {
    env: { ...process.env, DATABASE_URL: databaseUrl.toString(), BORE_POSTGRES_PASSWORD_FILE: "", PORT: String(port),
      HOST: "127.0.0.1", BORE_DB_PATH: dbPath, BORE_PUBLIC_DOMAIN: "example.com", BORE_TOKEN_SECRET: "pg-test-secret",
      BORE_SERVER_ORIGIN: `http://127.0.0.1:${port}`, BORE_TRAEFIK_ENABLED: "false", BORE_TLS_MODE: "off" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    child.kill("SIGTERM");
    await exited(child);
    await query(`DROP SCHEMA "${schema}" CASCADE`);
    assert.equal(child.exitCode, 0, output);
  });
  let output = "";
  child.stderr!.on("data", (data) => { output += data; });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server startup failed: ${output}`)), 8000);
    child.stdout!.on("data", (data) => { if (String(data).includes("listening")) { clearTimeout(timer); resolve(); } });
    child.once("exit", () => { clearTimeout(timer); reject(new Error(`Server exited: ${output}`)); });
  });
  const call = (path: string, token?: string, method = "GET") => new Promise<{
    status: number; headers: IncomingHttpHeaders; json(): Promise<Record<string, unknown>>;
  }>((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method, timeout: 3000,
      headers: { host: "example.com", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (data: Buffer) => chunks.push(data));
      res.once("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers,
        json: async () => JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown> }));
      res.once("error", reject);
    });
    req.once("error", reject);
    req.once("timeout", () => req.destroy(new Error("Test request timed out")));
    req.end();
  });
  const userId = randomUUID();
  const email = `${userId}@example.com`;
  const session = randomUUID();
  const now = new Date().toISOString();
  await query(`INSERT INTO "${schema}".users VALUES ($1,$2,'PG User',2,5,$3,$3)`, [userId, email, now]);
  await query(`INSERT INTO "${schema}".sessions VALUES ($1,$2,$3,$4)`, [session, userId, new Date(Date.now() + 60_000).toISOString(), now]);
  const tokens = new SessionTokenService("pg-test-secret");
  const token = tokens.sign({ userId, email });
  for (const credential of [token, session]) {
    const response = await call("/api/v1/me", credential);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).id, userId);
    const namespaces = await call("/api/v1/namespaces", credential);
    assert.equal(namespaces.status, 200);
    assert.deepEqual((await namespaces.json()).namespaces, []);
  }
  assert.equal((await call("/api/v1/me", "invalid-token")).status, 401);
  assert.equal((await call("/health")).status, 200);
  await query(`UPDATE "${schema}".users SET reservation_limit=7 WHERE id=$1`, [userId]);
  assert.equal((await (await call("/api/v1/me", token)).json()).reservationLimit, 7);
  const start = await call("/auth/cli/start?callback=http%3A%2F%2F127.0.0.1%3A9999%2F&state=test-state");
  assert.equal(start.status, 302);
  const requestId = new URL(start.headers.location!).searchParams.get("request");
  const approved = await call(`/auth/cli/complete?requestId=${requestId}`, session, "POST");
  assert.equal(approved.status, 200);
  const callback = new URL(String((await approved.json()).redirectTo));
  assert.equal(callback.searchParams.get("state"), "test-state");
  assert.equal(tokens.verify(callback.searchParams.get("token")!)?.sub, userId);

  const state = (await query<{ value: unknown; updated_at: string; revision: number }>(`SELECT * FROM "${schema}".app_state WHERE key='primary'`)).rows[0]!;
  await query(`DROP TABLE "${schema}".app_state`);
  assert.equal((await call("/api/v1/me", session)).status, 200);
  assert.equal((await call("/api/v1/namespaces", session)).status, 500);
  assert.equal((await call("/health")).status, 503);
  await query(`CREATE TABLE "${schema}".app_state (key TEXT PRIMARY KEY,value JSONB NOT NULL,updated_at TEXT NOT NULL,revision BIGINT NOT NULL DEFAULT 0)`);
  await query(`INSERT INTO "${schema}".app_state VALUES ('primary',$1::jsonb,$2,$3)`, [JSON.stringify(state.value), state.updated_at, state.revision]);
  assert.equal((await call("/api/v1/namespaces", session)).status, 200);
  assert.equal((await call("/health")).status, 200);
  assert.equal(existsSync(dbPath), false);
});

test("PostgreSQL startup never falls back to a supplied SQLite fixture when connection fails", { timeout: 10_000 }, async () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), "bore-pg-no-fallback-")), "must-not-exist.sqlite");
  const child = spawn(process.execPath, ["--import", "tsx", entrypoint], {
    env: { ...process.env, DATABASE_URL: "postgresql://bore:test-password@127.0.0.1:1/bore_test", BORE_POSTGRES_PASSWORD_FILE: "", BORE_DB_PATH: dbPath },
    stdio: ["ignore", "ignore", "pipe"],
  });
  const [code] = await once(child, "exit");
  assert.equal(code, 1);
  assert.equal(existsSync(dbPath), false);
});
