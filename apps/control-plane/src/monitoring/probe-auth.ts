import { createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";

export const PROBE_HEADER = "x-bore-monitoring-probe";
const path = process.env.BORE_MONITORING_PROBE_SECRET_FILE;
const secret = path ? readFileSync(path, "utf8").trim() : undefined;
if (path && !secret) throw new Error("Monitoring probe secret is empty");

function signature(key: string, host: string, method: string, time: string): string {
  return createHmac("sha256", key).update(`${host.toLowerCase()}\n${method}\n${time}`).digest("hex");
}
export function signProbe(host: string, method: string, now = Date.now(), key = secret): string | undefined {
  return key ? `${now}.${signature(key, host, method, String(now))}` : undefined;
}
export function isProbe(value: string | string[] | undefined, host: string, method: string, now = Date.now(), key = secret): boolean {
  if (!key || typeof value !== "string" || !/^\d{13}\.[a-f0-9]{64}$/.test(value)) return false;
  const [time, digest] = value.split(".");
  if (Math.abs(now - Number(time)) > 120_000) return false;
  return timingSafeEqual(Buffer.from(digest!, "hex"), Buffer.from(signature(key, host, method, time!), "hex"));
}
