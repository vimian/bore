import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync } from "node:fs";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { WebSocket } from "ws";
import { SQLiteStore } from "../src/store.js";
import { SessionTokenService } from "../src/session-tokens.js";

test("relays concurrent requests, cleans up aborted relays, and persists classified metrics", { timeout: 35_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "bore-relay-monitor-"));
  const dbPath = join(dir, "bore.sqlite");
  const store = new SQLiteStore(dbPath);
  await store.init();
  const user = await store.upsertUser({ id: "u", email: "test@example.com" });
  await store.update((state) => {
    const now = new Date().toISOString();
    state.devices.d = { id: "d", userId: user.id, name: "test", hostname: "test", platform: "test", fingerprint: "test", createdAt: now, updatedAt: now, lastSeenAt: now };
    state.reservations.r = { id: "r", userId: user.id, subdomain: "eva", createdAt: now, updatedAt: now, lastUsedAt: now };
    state.reservations.r.directRequestStats = { requestCount: 20_000, firstRequestAt: now, lastRequestAt: now,
      ipAddresses: Object.fromEntries(Array.from({ length: 20_000 }, (_, index) => [String(index), {
        ipAddress: String(index), requestCount: 1, firstSeenAt: now, lastSeenAt: now,
      }])) };
    state.deviceTunnels.t = { id: "t", userId: user.id, deviceId: "d", localPort: 3000, reservationId: "r", subdomain: "eva", claimedAt: now, updatedAt: now };
  });
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const address = listener.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("../src/index.ts", import.meta.url))], {
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", BORE_DB_PATH: dbPath, BORE_PUBLIC_DOMAIN: "example.com",
      BORE_SERVER_ORIGIN: `http://127.0.0.1:${port}`, BORE_TOKEN_SECRET: "integration-secret", BORE_TRAEFIK_ENABLED: "false", BORE_TLS_MODE: "off" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stderr.on("data", (data) => { output += data; });
  let socket: WebSocket | undefined;
  const get = (host: string, path = "/", token?: string) => new Promise<number>((resolve, reject) => {
    const headers = token ? { host, authorization: `Bearer ${token}` } : { host };
    const req = request({ host: "127.0.0.1", port, path, headers, timeout: 5000 }, (res) => {
      res.resume(); res.once("end", () => resolve(res.statusCode ?? 0));
    });
    req.once("error", reject);
    req.once("timeout", () => req.destroy(new Error("test request timeout")));
    req.end();
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Server startup failed: ${output}`)), 5000);
      child.stdout.on("data", (data) => { if (String(data).includes("listening")) { clearTimeout(timer); resolve(); } });
    });
    const token = new SessionTokenService("integration-secret").sign({ userId: user.id, email: user.email });
    socket = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}&deviceId=d`, { headers: { host: "example.com" } });
    socket.on("message", (raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === "proxy_request" && message.path !== "/hang") {
        socket!.send(JSON.stringify({ type: "proxy_response", requestId: message.requestId, status: 200, headers: {}, body: Buffer.from("ok").toString("base64"), localDurationMs: 2 }));
      }
    });
    await once(socket, "open");
    await new Promise((resolve) => setTimeout(resolve, 50));
    const responses = await Promise.all(Array.from({ length: 80 }, () => get("eva.example.com")));
    assert.ok(responses.every((status) => status === 200), JSON.stringify(responses));
    const authenticated = await Promise.all(Array.from({ length: 80 }, () => get("example.com", "/api/v1/me", token)));
    assert.ok(authenticated.every((status) => status === 200));
    assert.equal(await get("offline.example.com"), 502);
    const abort = request({ host: "127.0.0.1", port, path: "/hang", headers: { host: "eva.example.com" } });
    abort.on("error", () => {}); abort.end();
    await new Promise((resolve) => setTimeout(resolve, 100));
    abort.destroy();
    assert.equal(await get("example.com", "/health"), 200);
    await new Promise((resolve) => setTimeout(resolve, 15_500));
    const metrics = new DatabaseSync(join(dir, "monitoring.sqlite"), { readOnly: true });
    assert.equal(metrics.prepare("SELECT SUM(count) AS count FROM requests WHERE host='eva.example.com' AND status=200").get()?.count, 80);
    assert.equal(metrics.prepare("SELECT SUM(local_count) AS count FROM requests WHERE host='eva.example.com' AND status=200").get()?.count, 80);
    assert.equal(metrics.prepare("SELECT SUM(count) AS count FROM requests WHERE outcome='client_aborted'").get()?.count, 1);
    const runtime = metrics.prepare("SELECT data FROM samples WHERE source='control-plane' ORDER BY time DESC LIMIT 1").get() as { data: string };
    assert.equal(JSON.parse(runtime.data).pendingRelays, 0);
    metrics.close();
  } finally {
    socket?.terminate();
    child.kill("SIGTERM");
    if (child.exitCode === null) await once(child, "exit");
  }
});
