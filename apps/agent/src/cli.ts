#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { ApiClient } from "./api-client.js";
import { login } from "./auth.js";
import { ensureAutostart } from "./autostart.js";
import { ensureDaemonRunning } from "./daemon-process.js";
import { syncDaemon } from "./local-control.js";
import { loadConfig, saveConfig } from "./state.js";
import type { AgentConfig, NamespaceView, TunnelView } from "./types.js";

function usage(): string {
  return [
    "Usage:",
    "  bore login [--server <origin>]",
    "  bore whoami",
    "  bore up <port>",
    "  bore down <port>",
    "  bore release <namespace>",
    "  bore reassign <port>",
    "  bore host add <namespace> <label>",
    "  bore host rm <namespace> <label>",
    "  bore ps",
    "  bore ls",
  ].join("\n");
}

function parseServerOrigin(value: string | undefined): string {
  const origin = value?.trim();

  if (!origin) {
    throw new Error("Missing value for --server");
  }

  let url: URL;

  try {
    url = new URL(origin);
  } catch {
    throw new Error(`Invalid server origin: ${origin}`);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Server origin must use http or https");
  }

  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function consumeServerOriginFlag(args: string[]): { args: string[]; serverOrigin?: string } {
  const nextArgs: string[] = [];
  let serverOrigin: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--server") {
      serverOrigin = parseServerOrigin(args[index + 1]);
      index += 1;
      continue;
    }

    nextArgs.push(arg!);
  }

  return { args: nextArgs, serverOrigin };
}

function parsePort(value: string | undefined): number {
  const port = Number.parseInt(value ?? "", 10);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Port must be an integer between 1 and 65535");
  }

  return port;
}

function formatTable(rows: string[][]): string {
  const widths = rows[0]!.map((_, index) =>
    Math.max(...rows.map((row) => row[index]?.length ?? 0)),
  );

  return rows
    .map((row) =>
      row.map((cell, index) => cell.padEnd(widths[index]!)).join("  ").trimEnd(),
    )
    .join("\n");
}

function printTunnels(tunnels: TunnelView[]): void {
  if (tunnels.length === 0) {
    console.log("No tunnels found.");
    return;
  }

  console.log(
    formatTable([
      ["status", "subdomain", "port", "device", "hostname", "url"],
      ...tunnels.map((tunnel) => [
        tunnel.status,
        tunnel.subdomain,
        String(tunnel.localPort),
        tunnel.deviceName,
        tunnel.hostname,
        tunnel.publicUrl,
      ]),
    ]),
  );
}

function printNamespaces(namespaces: NamespaceView[]): void {
  if (namespaces.length === 0) {
    console.log("No namespaces found.");
    return;
  }

  for (const namespace of namespaces) {
    console.log(`${namespace.subdomain} (${namespace.status})`);
    console.log(`  root: ${namespace.publicUrl}`);

    if (namespace.accessHosts.length === 0) {
      console.log("  child hosts: none");
    } else {
      console.log(
        `  child hosts: ${namespace.accessHosts
          .map((accessHost) => `${accessHost.label} [${accessHost.kind}]`)
          .join(", ")}`,
      );
      for (const accessHost of namespace.accessHosts) {
        console.log(`    ${accessHost.publicUrl}`);
      }
    }

    if (namespace.claims.length === 0) {
      console.log("  claims: none");
    } else {
      for (const claim of namespace.claims) {
        console.log(
          `  claim: ${claim.status} localhost:${claim.localPort} on ${claim.deviceName} (${claim.hostname})`,
        );
      }
    }
  }
}

async function promptNamespaceChoice(
  reusableSubdomains: string[],
  currentSubdomain?: string,
): Promise<string | undefined> {
  const reusable = reusableSubdomains.filter((subdomain) => subdomain !== currentSubdomain);

  if (reusable.length === 0) {
    return undefined;
  }

  const rl = createInterface({ input, output });

  try {
    if (reusable.length === 1) {
      const answer = await rl.question(
        `Reuse reserved namespace *.${reusable[0]}? [Y/n]: `,
      );
      return answer.trim().toLowerCase().startsWith("n") ? undefined : reusable[0];
    }

    console.log("Choose a reserved namespace to reuse, or generate a new one:");
    reusable.forEach((subdomain, index) => {
      console.log(`  ${index + 1}. *.${subdomain}`);
    });
    console.log("  0. Generate a new namespace");

    while (true) {
      const answer = await rl.question("Selection: ");
      const selection = Number.parseInt(answer.trim(), 10);

      if (Number.isInteger(selection) && selection >= 0 && selection <= reusable.length) {
        return selection === 0 ? undefined : reusable[selection - 1];
      }
    }
  } finally {
    rl.close();
  }
}

function mergeAssignedNamespaces(
  config: AgentConfig,
  tunnels: TunnelView[],
  deviceId: string,
): AgentConfig {
  return {
    ...config,
    desiredTunnels: config.desiredTunnels.map((tunnel) => {
      const assigned = tunnels.find(
        (item) => item.deviceId === deviceId && item.localPort === tunnel.localPort,
      );

      return assigned
        ? {
            ...tunnel,
            preferredSubdomain: assigned.subdomain,
            allocateNewSubdomain: undefined,
          }
        : tunnel;
    }),
  };
}

async function waitForTunnelStatus(
  config: AgentConfig,
  port: number,
  initialTunnel?: TunnelView,
): Promise<TunnelView | undefined> {
  if (!initialTunnel || initialTunnel.status !== "offline") {
    return initialTunnel;
  }

  const client = new ApiClient(config);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const tunnel = (await client.listTunnels()).find(
      (item) => item.deviceId === config.deviceId && item.localPort === port,
    );

    if (!tunnel || tunnel.status !== "offline") {
      return tunnel;
    }
  }

  return initialTunnel;
}

async function ensureLoggedIn(config: AgentConfig): Promise<AgentConfig> {
  return config.token ? config : login(config);
}

async function handleLogin(args: string[]): Promise<void> {
  const { args: remainingArgs, serverOrigin } = consumeServerOriginFlag(args);

  if (remainingArgs.length > 0) {
    throw new Error("Usage: bore login [--server <origin>]");
  }

  const config = await loadConfig();
  const loginConfig = serverOrigin ? { ...config, serverOrigin } : config;
  const nextConfig = await login(loginConfig);
  console.log(`Logged in as ${nextConfig.userEmail ?? "unknown user"}.`);
}

async function handleWhoAmI(): Promise<void> {
  const config = await ensureLoggedIn(await loadConfig());
  const client = new ApiClient(config);
  const me = await client.getMe();
  console.log(`${me.email} (${me.name})`);
}

async function handleUp(args: string[]): Promise<void> {
  let config = await ensureLoggedIn(await loadConfig());
  const port = parsePort(args[0]);

  if (args.includes("--subdomain")) {
    throw new Error("Custom subdomains are no longer supported. The server assigns one automatically.");
  }

  const existingTunnel = config.desiredTunnels.find((item) => item.localPort === port);
  let preferredSubdomain = existingTunnel?.preferredSubdomain;
  let allocateNewSubdomain = existingTunnel?.allocateNewSubdomain;

  if (!existingTunnel) {
    await ensureDaemonRunning(import.meta.url);
    const current = await syncDaemon();
    preferredSubdomain = await promptNamespaceChoice(current.reusableSubdomains);
    allocateNewSubdomain = preferredSubdomain ? undefined : true;
  }

  const desiredTunnels = config.desiredTunnels.filter((item) => item.localPort !== port);
  desiredTunnels.push({ localPort: port, preferredSubdomain, allocateNewSubdomain });
  config = { ...config, desiredTunnels };
  await saveConfig(config);

  try {
    if (await ensureAutostart(config, import.meta.url)) {
      config = { ...config, autostartInstalled: true };
      await saveConfig(config);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Warning: unable to install autostart: ${message}`);
  }

  await ensureDaemonRunning(import.meta.url);
  const result = await syncDaemon();
  config = mergeAssignedNamespaces(config, result.tunnels, config.deviceId);
  await saveConfig(config);
  const tunnel = result.tunnels.find(
    (item) => item.deviceId === config.deviceId && item.localPort === port,
  );

  const resolvedTunnel = await waitForTunnelStatus(config, port, tunnel);

  if (!resolvedTunnel) {
    throw new Error("The daemon synced, but the tunnel was not returned");
  }

  console.log(`${resolvedTunnel.publicUrl} -> localhost:${port} (${resolvedTunnel.status})`);
  const namespace = result.namespaces.find((item) => item.subdomain === resolvedTunnel.subdomain);

  if (namespace) {
    for (const accessHost of namespace.accessHosts) {
      console.log(`${accessHost.publicUrl} -> localhost:${port} (${accessHost.kind})`);
    }
  }

  if (result.reusableSubdomains.length > 0) {
    console.log(`Available reserved namespaces: ${result.reusableSubdomains.join(", ")}`);
  }
}

async function handleDown(args: string[]): Promise<void> {
  const config = await loadConfig();
  const port = parsePort(args[0]);
  const nextConfig = {
    ...config,
    desiredTunnels: config.desiredTunnels.filter((item) => item.localPort !== port),
  };
  await saveConfig(nextConfig);

  await ensureDaemonRunning(import.meta.url);
  await syncDaemon();
  console.log(`Stopped tunnel for localhost:${port}. The subdomain reservation is still kept.`);
}

async function handleRelease(args: string[]): Promise<void> {
  const subdomain = args[0]?.trim();

  if (!subdomain || args.length !== 1) {
    throw new Error("Usage: bore release <namespace>");
  }

  const config = await ensureLoggedIn(await loadConfig());
  const client = new ApiClient(config);
  const result = await client.releaseNamespace(subdomain);

  console.log(`Released namespace ${result.releasedSubdomain}.`);

  if (result.removedAccessHostnames.length === 0) {
    console.log("Removed child hosts: none");
    return;
  }

  console.log("Removed child hosts:");
  for (const hostname of result.removedAccessHostnames) {
    console.log(`  ${hostname}`);
  }
}

async function handleReassign(args: string[]): Promise<void> {
  let config = await ensureLoggedIn(await loadConfig());
  const port = parsePort(args[0]);
  const existingTunnel = config.desiredTunnels.find((item) => item.localPort === port);

  if (!existingTunnel) {
    throw new Error(`No configured tunnel for localhost:${port}`);
  }

  await ensureDaemonRunning(import.meta.url);
  const current = await syncDaemon();
  const currentAssigned =
    current.tunnels.find((item) => item.deviceId === config.deviceId && item.localPort === port)
      ?.subdomain ?? existingTunnel.preferredSubdomain;
  const selectedSubdomain = await promptNamespaceChoice(
    current.reusableSubdomains,
    currentAssigned,
  );
  config = {
    ...config,
    desiredTunnels: config.desiredTunnels.map((item) =>
      item.localPort === port
        ? {
            ...item,
            preferredSubdomain: selectedSubdomain,
            allocateNewSubdomain: selectedSubdomain ? undefined : true,
          }
        : item,
    ),
  };
  await saveConfig(config);
  const result = await syncDaemon();
  config = mergeAssignedNamespaces(config, result.tunnels, config.deviceId);
  await saveConfig(config);
  const tunnel = result.tunnels.find(
    (item) => item.deviceId === config.deviceId && item.localPort === port,
  );

  if (!tunnel) {
    throw new Error("The daemon synced, but the tunnel was not returned");
  }

  console.log(`Reassigned localhost:${port} to ${tunnel.publicUrl} (${tunnel.status})`);
}

async function handlePs(): Promise<void> {
  const config = await ensureLoggedIn(await loadConfig());
  const client = new ApiClient(config);
  printTunnels(await client.listTunnels());
}

async function handleLs(): Promise<void> {
  const config = await ensureLoggedIn(await loadConfig());
  const client = new ApiClient(config);
  printNamespaces(await client.listNamespaces());
}

async function handleHost(args: string[]): Promise<void> {
  const [subcommand, subdomain, label] = args;

  if (!subdomain || !label || !["add", "rm"].includes(subcommand ?? "")) {
    throw new Error("Usage: bore host add <namespace> <label>\n  bore host rm <namespace> <label>");
  }

  const config = await ensureLoggedIn(await loadConfig());
  const client = new ApiClient(config);

  if (subcommand === "add") {
    const result = await client.createAccessHost(subdomain, label);

    if (!result.accessHost) {
      throw new Error("The server reserved the child host, but did not return its public URL");
    }

    console.log(`Reserved ${result.accessHost.publicUrl}`);

    if (result.namespace) {
      console.log(`Namespace ${result.namespace.subdomain} now has:`);
      for (const accessHost of result.namespace.accessHosts) {
        console.log(`  ${accessHost.publicUrl} (${accessHost.kind})`);
      }
    }

    return;
  }

  const result = await client.removeAccessHost(subdomain, label);
  console.log(`Removed ${result.removedHostname}`);

  if (result.namespace) {
    console.log(`Namespace ${result.namespace.subdomain} now has:`);
    if (result.namespace.accessHosts.length === 0) {
      console.log("  no child hosts");
    } else {
      for (const accessHost of result.namespace.accessHosts) {
        console.log(`  ${accessHost.publicUrl} (${accessHost.kind})`);
      }
    }
  }
}

async function handleDaemon(args: string[]): Promise<void> {
  if (args[0] !== "start") {
    throw new Error("Usage: bore daemon start");
  }

  const { runDaemon } = await import("./daemon-runtime.js");
  await runDaemon();
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case "login":
      await handleLogin(args);
      return;
    case "whoami":
      await handleWhoAmI();
      return;
    case "up":
      await handleUp(args);
      return;
    case "down":
      await handleDown(args);
      return;
    case "release":
      await handleRelease(args);
      return;
    case "reassign":
      await handleReassign(args);
      return;
    case "ps":
      await handlePs();
      return;
    case "ls":
      await handleLs();
      return;
    case "host":
      await handleHost(args);
      return;
    case "daemon":
      await handleDaemon(args);
      return;
    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(usage());
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  console.log(usage());
  process.exitCode = 1;
});
