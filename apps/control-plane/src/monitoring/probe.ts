import { request } from "node:https";
import { request as httpRequest } from "node:http";
import { PROBE_HEADER, signProbe } from "./probe-auth.js";

export interface ProbeResult {
  status: number;
  durationMs: number;
  dnsMs: number;
  connectMs: number;
  tlsMs: number;
  firstByteMs: number;
  error: string;
}

export function probe(url: string, timeoutMs = 10_000): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const started = performance.now();
    const result: ProbeResult = { status: 0, durationMs: 0, dnsMs: 0, connectMs: 0, tlsMs: 0, firstByteMs: 0, error: "" };
    let finished = false;
    const complete = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      result.durationMs = performance.now() - started;
      resolve(result);
    };
    const target = new URL(url);
    const transport = target.protocol === "https:" ? request : httpRequest;
    const method = target.pathname === "/health" ? "GET" : "HEAD";
    const signature = signProbe(target.hostname, method);
    const req = transport(target, { method, agent: false, headers: signature ? { [PROBE_HEADER]: signature } : {} }, (res) => {
      result.status = res.statusCode ?? 0;
      result.firstByteMs = performance.now() - started;
      res.resume();
      res.once("end", complete);
      res.once("error", () => { result.error = "response_error"; complete(); });
    });
    const timeout = setTimeout(() => { result.error = "timeout"; req.destroy(); complete(); }, timeoutMs);
    req.once("socket", (socket) => {
      socket.once("lookup", () => { result.dnsMs = performance.now() - started; });
      socket.once("connect", () => { result.connectMs = performance.now() - started; });
      socket.once("secureConnect", () => { result.tlsMs = performance.now() - started; });
    });
    req.once("error", (error: NodeJS.ErrnoException) => { result.error ||= error.code ?? "network_error"; complete(); });
    req.end();
  });
}
