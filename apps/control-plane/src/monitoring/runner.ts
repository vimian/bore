import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import type { PersistedState } from "../types.js";
import { probe } from "./probe.js";
import { openMonitoringDb, saveSample, pruneMonitoring } from "./storage.js";

const dbPath = process.env.BORE_DB_PATH ?? "/data/bore.sqlite";
const monitoring = openMonitoringDb(process.env.BORE_MONITORING_DB_PATH ?? join(dirname(dbPath), "monitoring.sqlite"));
const stateDb = new DatabaseSync(dbPath, { readOnly: true });
const domain = process.env.BORE_PUBLIC_DOMAIN ?? "bore.dk";
let lastPrune = 0;

function hostResources(): Record<string, unknown> {
  try {
    const load = readFileSync("/host/proc/loadavg", "utf8").trim().split(/\s+/);
    const mem = Object.fromEntries(readFileSync("/host/proc/meminfo", "utf8").trim().split("\n")
      .map((line) => { const [key, value] = line.split(/:\s+/); return [key, Number.parseInt(value ?? "0", 10) * 1024]; }));
    const cpu = readFileSync("/host/proc/stat", "utf8").split("\n")[0];
    return { load1: Number(load[0]), load5: Number(load[1]), memoryTotal: mem.MemTotal,
      memoryAvailable: mem.MemAvailable, swapUsed: (mem.SwapTotal ?? 0) - (mem.SwapFree ?? 0), cpu };
  } catch { return { hostResourcesUnavailable: true }; }
}

async function collect(): Promise<void> {
  const row = stateDb.prepare("SELECT value FROM app_state WHERE key=?").get("primary") as { value: string } | undefined;
  if (!row) throw new Error("Primary state is missing");
  const state = JSON.parse(row.value) as PersistedState;
  const reservations = Object.values(state.reservations);
  const activeReservations = new Set(Object.values(state.deviceTunnels)
    .filter((tunnel) => state.deviceConnections[tunnel.deviceId] &&
      Date.now() - Date.parse(state.devices[tunnel.deviceId]?.lastSeenAt ?? "") < 120_000)
    .map((tunnel) => tunnel.reservationId));
  const targets = [{ host: domain, url: `https://${domain}/health`, active: true },
    ...reservations.map((item) => ({ host: `${item.subdomain}.${domain}`, url: `https://${item.subdomain}.${domain}/`, active: activeReservations.has(item.id) })),
    ...Object.values(state.accessHosts).map((item) => ({ host: `${item.hostname}.${domain}`, url: `https://${item.hostname}.${domain}/`, active: activeReservations.has(item.reservationId) }))]
    .filter((target) => /^[a-z0-9.-]+$/.test(target.host)).slice(0, 512);
  const results: unknown[] = [];
  const queue = [...targets];
  const worker = async () => {
    for (let target = queue.shift(); target; target = queue.shift()) {
      const result = await probe(target.url);
      const failed = result.status === 0 || result.status >= 500;
      const details = { ...result, expectedConnected: target.active };
      monitoring.prepare("INSERT OR REPLACE INTO probes VALUES (?, ?, ?, ?, ?)")
        .run(Date.now(), target.host, result.status, result.durationMs, JSON.stringify(details));
      if (target.active && (failed || result.durationMs > 3000)) {
        console.warn(JSON.stringify({ event: "bore_probe_alert", host: target.host, ...details }));
      }
      results.push({ host: target.host, active: target.active, status: result.status, durationMs: result.durationMs });
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  saveSample(monitoring, "host", { ...hostResources(), stateBytes: Buffer.byteLength(row.value), namespaces: reservations.length,
    activeNamespaces: activeReservations.size, deviceConnections: Object.keys(state.deviceConnections).length, probes: results });
  if (Date.now() - lastPrune > 3600_000) { pruneMonitoring(monitoring); lastPrune = Date.now(); }
  console.log(JSON.stringify({ event: "bore_monitoring_cycle", hosts: targets.length, activeNamespaces: activeReservations.size }));
}

let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => { stopping = true; });
while (!stopping) {
  const started = Date.now();
  try { await collect(); } catch (error) { console.error("Monitoring cycle failed", error); }
  if (!stopping) await new Promise((resolve) => setTimeout(resolve, Math.max(1000, 60_000 - (Date.now() - started))));
}
stateDb.close();
monitoring.close();
