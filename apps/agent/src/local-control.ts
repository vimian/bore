import { loadRuntime } from "./state.js";
import type { SyncResponse } from "./types.js";

async function requestLocal<T>(path: string, init?: RequestInit): Promise<T> {
  const runtime = await loadRuntime();

  if (!runtime.controlPort) {
    throw new Error("bore daemon is not running");
  }

  const response = await fetch(`http://127.0.0.1:${runtime.controlPort}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as T;
}

export async function isDaemonHealthy(): Promise<boolean> {
  try {
    await requestLocal("/health");
    return true;
  } catch {
    return false;
  }
}

export async function syncDaemon(): Promise<SyncResponse> {
  return requestLocal("/sync", { method: "POST" });
}

