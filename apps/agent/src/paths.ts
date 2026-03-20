import { homedir, hostname } from "node:os";
import { join } from "node:path";

export function getConfigDir(): string {
  return join(homedir(), ".bore");
}

export function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

export function getRuntimePath(): string {
  return join(getConfigDir(), "runtime.json");
}

export function getDefaultDeviceName(): string {
  return hostname();
}

