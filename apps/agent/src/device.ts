import { createHash } from "node:crypto";
import { hostname, platform } from "node:os";

import type { AgentConfig } from "./types.js";

export function buildDeviceRegistration(config: AgentConfig) {
  const host = hostname();
  const osPlatform = platform();
  const fingerprint = createHash("sha256")
    .update(`${config.deviceId}:${host}:${osPlatform}`)
    .digest("hex");

  return {
    deviceId: config.deviceId,
    name: config.deviceName,
    hostname: host,
    platform: osPlatform,
    fingerprint,
  };
}

