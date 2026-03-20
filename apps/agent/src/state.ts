import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

import { getConfigDir, getConfigPath, getDefaultDeviceName, getRuntimePath } from "./paths.js";
import type { AgentConfig, RuntimeState } from "./types.js";

const defaultServerOrigin = process.env.BORE_SERVER_ORIGIN ?? "https://bore.dk";
const overriddenServerOrigin = process.env.BORE_SERVER_ORIGIN;

export async function loadConfig(): Promise<AgentConfig> {
  await mkdir(getConfigDir(), { recursive: true });

  try {
    const raw = await readFile(getConfigPath(), "utf8");
    const parsed = JSON.parse(raw) as AgentConfig;

    return {
      serverOrigin: overriddenServerOrigin ?? parsed.serverOrigin ?? defaultServerOrigin,
      token: parsed.token,
      userEmail: parsed.userEmail,
      deviceId: parsed.deviceId ?? randomUUID(),
      deviceName: parsed.deviceName ?? getDefaultDeviceName(),
      desiredTunnels: (parsed.desiredTunnels ?? []).map((tunnel) => ({
        localPort: tunnel.localPort,
        preferredSubdomain: tunnel.preferredSubdomain,
        allocateNewSubdomain: tunnel.allocateNewSubdomain,
      })),
      autostartInstalled: parsed.autostartInstalled ?? false,
    };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;

    if (err.code !== "ENOENT") {
      throw err;
    }

    const config: AgentConfig = {
      serverOrigin: defaultServerOrigin,
      deviceId: randomUUID(),
      deviceName: getDefaultDeviceName(),
      desiredTunnels: [],
      autostartInstalled: false,
    };

    await saveConfig(config);
    return config;
  }
}

export async function saveConfig(config: AgentConfig): Promise<void> {
  await mkdir(getConfigDir(), { recursive: true });
  await writeFile(getConfigPath(), JSON.stringify(config, null, 2), "utf8");
}

export async function loadRuntime(): Promise<RuntimeState> {
  await mkdir(getConfigDir(), { recursive: true });

  try {
    const raw = await readFile(getRuntimePath(), "utf8");
    return JSON.parse(raw) as RuntimeState;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;

    if (err.code !== "ENOENT") {
      throw err;
    }

    return {};
  }
}

export async function saveRuntime(state: RuntimeState): Promise<void> {
  await mkdir(getConfigDir(), { recursive: true });
  await writeFile(getRuntimePath(), JSON.stringify(state, null, 2), "utf8");
}

