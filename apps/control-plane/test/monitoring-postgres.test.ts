import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { promisify } from "node:util";
import test from "node:test";
import { closeDatabase, ensureSchema, query } from "@bore/database";
import { PostgresMonitoringStorage } from "../src/monitoring/postgres.js";
import { buildMonitoringReport } from "../src/monitoring/report-data.js";
import type { RequestAggregate } from "../src/monitoring/storage.js";
import { monitoringStateReader } from "../src/monitoring/state.js";

test("PostgreSQL monitoring adds concurrent aggregates atomically and preserves report types", {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await ensureSchema();
  const storage = new PostgresMonitoringStorage();
  const host = `${randomUUID()}.test.example`;
  const time = Date.now();
  const minute = Math.floor(time / 60_000) * 60_000;
  const source = `test-${randomUUID()}`;
  const request: RequestAggregate = { minute, host, protocol: "http", outcome: "completed", status: 200,
    count: 1, totalMs: 100, maxMs: 100, routingMs: 10, relayMs: 80, bytes: 123, localMs: 60,
    localCount: 1, histogram: [0, 1, 0, 0, 0, 0, 0, 0, 0] };
  try {
    const reader = monitoringStateReader("/does-not-exist/bore.sqlite", process.env.TEST_DATABASE_URL);
    const state = await reader.read();
    assert.equal(state.stateBytes, Buffer.byteLength(JSON.stringify(state.state)));
    reader.close();
    await Promise.all(Array.from({ length: 10 }, () => storage.saveBatch({ requests: [request],
      devices: [{ minute, deviceId: source, event: "connected", code: 0, count: 1 }], samples: [] })));
    const { rows } = await query<{ count: number; histogram: number[]; bytes: number }>(
      "SELECT count,histogram,bytes FROM monitoring.requests WHERE host=$1", [host]);
    assert.equal(rows[0]?.count, 10);
    assert.equal(rows[0]?.bytes, 1230);
    assert.deepEqual(rows[0]?.histogram, [0, 10, 0, 0, 0, 0, 0, 0, 0]);
    await assert.rejects(storage.saveBatch({ requests: [request],
      devices: [{ minute, deviceId: source, event: "bad", code: NaN, count: 1 }], samples: [] }));
    assert.equal((await query<{ count: number }>("SELECT count FROM monitoring.requests WHERE host=$1", [host])).rows[0]?.count, 10);
    await storage.saveBatch({ requests: [], devices: [], samples: [{ time, source, data: { numeric: 42, boolean: true } }] });
    const sample = (await query<{ time: number; data: object }>("SELECT time,data FROM monitoring.samples WHERE source=$1", [source])).rows[0];
    assert.equal(typeof sample?.time, "number");
    assert.deepEqual(sample?.data, { numeric: 42, boolean: true });
    await storage.saveProbe({ time, host, status: 502, durationMs: 500, error: { expectedConnected: true, error: "timeout" } });
    const report = await buildMonitoringReport(1, host, { databaseUrl: process.env.TEST_DATABASE_URL });
    const recorded = (report.requests as Record<string, unknown>[])[0];
    assert.equal(recorded?.count, 10);
    assert.equal(recorded?.avgMs, 100);
    assert.equal(recorded?.avgRelayMs, 80);
    assert.equal(recorded?.avgLocalMs, 60);
    assert.equal(recorded?.localTimingCount, 10);
    assert.deepEqual(report.latencyP95, [{ host, p95UpperBoundMs: 100 }]);
    assert.equal((report.recentProbeFailures as unknown[]).length, 1);
    const devices = report.deviceEvents as Record<string, unknown>[];
    assert.equal(devices.find((row) => row.deviceId === source)?.count, 10);
    await query("INSERT INTO monitoring.requests SELECT $1,host,protocol,outcome,status,count,total_ms,max_ms,routing_ms,relay_ms,bytes,histogram,local_ms,local_count FROM monitoring.requests WHERE host=$2", [time - 15 * 86400_000, host]);
    await storage.prune();
    assert.equal((await query("SELECT * FROM monitoring.requests WHERE host=$1", [host])).rows.length, 1);
  } finally {
    await query("DELETE FROM monitoring.requests WHERE host=$1", [host]);
    await query("DELETE FROM monitoring.probes WHERE host=$1", [host]);
    await query("DELETE FROM monitoring.device_events WHERE device_id=$1", [source]);
    await query("DELETE FROM monitoring.samples WHERE source=$1", [source]);
    await closeDatabase();
  }
});

test("PostgreSQL runner stores independent samples and exits promptly on SIGTERM", {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await ensureSchema();
  const started = Date.now();
  const child = spawn(process.execPath, ["--import", "tsx", new URL("../src/monitoring/runner.ts", import.meta.url).pathname], {
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, BORE_DB_PATH: "/does-not-exist/bore.sqlite",
      BORE_MONITORING_DB_PATH: "/does-not-exist/monitoring.sqlite", BORE_PUBLIC_DOMAIN: "invalid:domain",
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --no-experimental-sqlite` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const closed = once(child, "close");
  let output = "";
  let errors = "";
  child.stderr.on("data", (data) => { errors += String(data); });
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { reject(new Error(`Runner did not start: ${errors}`)); }, 10_000);
      child.stdout.on("data", (data) => {
        output += String(data);
        if (output.includes("bore_monitoring_cycle")) { clearTimeout(timeout); resolve(); }
      });
      child.once("error", (error) => { clearTimeout(timeout); reject(error); });
      child.once("exit", () => { clearTimeout(timeout); if (!output.includes("bore_monitoring_cycle")) reject(new Error(errors)); });
    });
    const samples = await query<{ data: Record<string, unknown> }>(
      "SELECT data FROM monitoring.samples WHERE source='host' AND time >= $1", [started]);
    assert.ok(samples.rows.length >= 1);
    assert.equal(typeof samples.rows[0]?.data.stateBytes, "number");
    child.kill("SIGTERM");
    const [code] = await Promise.race([closed, new Promise<never>((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Runner ignored SIGTERM")), 3000); timer.unref();
    })]);
    assert.equal(code, 0, errors);
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    await closed;
    await query("DELETE FROM monitoring.samples WHERE source='host' AND time >= $1", [started]);
    await closeDatabase();
  }
});

test("PostgreSQL recorder and reports do not import SQLite even when it is disabled", {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const host = `${randomUUID()}.lazy.example`;
  const recorder = new URL("../src/monitoring/recorder.ts", import.meta.url).href;
  const reporting = new URL("../src/monitoring/report-data.ts", import.meta.url).href;
  const script = `
    const { TunnelMonitoring } = await import(${JSON.stringify(recorder)});
    const { buildMonitoringReport } = await import(${JSON.stringify(reporting)});
    const { closeDatabase } = await import('@bore/database');
    const monitoring = new TunnelMonitoring('/does-not-exist/bore.sqlite');
    monitoring.trace(${JSON.stringify(host)}, 'http').finish(200);
    await monitoring.close();
    console.log(JSON.stringify((await buildMonitoringReport(1, ${JSON.stringify(host)})).requests));
    await closeDatabase();
  `;
  try {
    const { stdout, stderr } = await promisify(execFile)(process.execPath,
      ["--no-experimental-sqlite", "--import", "tsx", "--input-type=module", "--eval", script],
      { env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL }, timeout: 10_000 });
    assert.equal(stderr, "");
    assert.equal((JSON.parse(stdout) as { count: number }[])[0]?.count, 1);
  } finally {
    await query("DELETE FROM monitoring.requests WHERE host=$1", [host]);
    await closeDatabase();
  }
});
