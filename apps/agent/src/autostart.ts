import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";

import { getDaemonLaunchSpec } from "./daemon-process.js";
import type { AgentConfig } from "./types.js";

function quoteWindowsArgument(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function runWindowsCommand(command: string, args: string[]): { ok: boolean; message?: string } {
  const result = spawnSync(command, args, {
    windowsHide: true,
    encoding: "utf8",
  });

  if (result.status === 0) {
    return { ok: true };
  }

  const message =
    result.stderr?.trim() || result.stdout?.trim() || result.error?.message || "Command failed";
  return { ok: false, message };
}

function installWindowsAutostart(taskCommand: string): void {
  const taskResult = runWindowsCommand("schtasks", [
    "/Create",
    "/SC",
    "ONLOGON",
    "/TN",
    "BoreAgent",
    "/TR",
    taskCommand,
    "/F",
  ]);

  if (taskResult.ok) {
    return;
  }

  // Fall back to a user-scoped registry startup entry when Task Scheduler
  // creation is denied in the current environment.
  const registryResult = runWindowsCommand("reg", [
    "ADD",
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
    "/V",
    "BoreAgent",
    "/T",
    "REG_SZ",
    "/D",
    taskCommand,
    "/F",
  ]);

  if (!registryResult.ok) {
    throw new Error(
      `Unable to install Windows autostart. Task Scheduler: ${taskResult.message}. Registry fallback: ${registryResult.message}`,
    );
  }
}

export async function ensureAutostart(config: AgentConfig, importMetaUrl: string): Promise<boolean> {
  if (config.autostartInstalled) {
    return false;
  }

  const launch = getDaemonLaunchSpec(importMetaUrl);
  const currentPlatform = platform();

  if (currentPlatform === "win32") {
    const taskCommand = [launch.command, ...launch.args]
      .map(quoteWindowsArgument)
      .join(" ");

    installWindowsAutostart(taskCommand);
    return true;
  }

  if (currentPlatform === "darwin") {
    const launchAgentDir = join(homedir(), "Library", "LaunchAgents");
    const plistPath = join(launchAgentDir, "dev.bore.agent.plist");
    const args = [launch.command, ...launch.args]
      .map((arg) => `<string>${arg}</string>`)
      .join("");

    await mkdir(launchAgentDir, { recursive: true });
    await writeFile(
      plistPath,
      [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">",
        "<plist version=\"1.0\">",
        "<dict>",
        "<key>Label</key><string>dev.bore.agent</string>",
        "<key>ProgramArguments</key><array>",
        args,
        "</array>",
        "<key>RunAtLoad</key><true/>",
        "<key>KeepAlive</key><true/>",
        "</dict>",
        "</plist>",
      ].join(""),
      "utf8",
    );

    execFileSync("launchctl", ["load", "-w", plistPath]);
    return true;
  }

  const systemdDir = join(homedir(), ".config", "systemd", "user");
  const servicePath = join(systemdDir, "bore-agent.service");
  await mkdir(systemdDir, { recursive: true });
  await writeFile(
    servicePath,
    [
      "[Unit]",
      "Description=Bore Agent",
      "",
      "[Service]",
      `ExecStart=${[launch.command, ...launch.args].join(" ")}`,
      "Restart=always",
      "",
      "[Install]",
      "WantedBy=default.target",
      "",
    ].join("\n"),
    "utf8",
  );

  execFileSync("systemctl", ["--user", "daemon-reload"]);
  execFileSync("systemctl", ["--user", "enable", "--now", "bore-agent.service"]);
  return true;
}
