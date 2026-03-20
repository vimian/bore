import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { isDaemonHealthy } from "./local-control.js";

export interface LaunchSpec {
  command: string;
  args: string[];
}

export function getDaemonLaunchSpec(importMetaUrl: string): LaunchSpec {
  const currentPath = fileURLToPath(importMetaUrl);
  const currentDir = dirname(currentPath);

  if (currentPath.endsWith(".ts")) {
    return {
      command: process.execPath,
      args: ["--import", "tsx", join(currentDir, "daemon-entry.ts")],
    };
  }

  return {
    command: process.execPath,
    args: [join(currentDir, "daemon-entry.js")],
  };
}

export async function ensureDaemonRunning(importMetaUrl: string): Promise<void> {
  if (await isDaemonHealthy()) {
    return;
  }

  const launch = getDaemonLaunchSpec(importMetaUrl);
  const child = spawn(launch.command, launch.args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));

    if (await isDaemonHealthy()) {
      return;
    }
  }

  throw new Error("Timed out waiting for the bore daemon to start");
}
