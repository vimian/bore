import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ControlPlaneConfig } from "./config.js";
import type { PersistedState } from "./types.js";

function quoteHost(host: string): string {
  return `Host(\`${host}\`)`;
}

function sanitizeName(input: string): string {
  return input.replace(/[^a-z0-9-]+/g, "-");
}

function buildNamespaceConfig(
  publicDomain: string,
  serviceName: string,
  certificateResolver: string,
  subdomain: string,
  accessHosts: string[],
): string {
  const hosts = [`${subdomain}.${publicDomain}`, ...accessHosts.map((host) => `${host}.${publicDomain}`)]
    .sort();
  const rule = hosts.map(quoteHost).join(" || ");
  const name = sanitizeName(subdomain);

  return [
    "http:",
    "  routers:",
    `    bore-${name}-http:`,
    "      entryPoints:",
    "        - web",
    `      rule: \"${rule}\"`,
    `      service: ${serviceName}`,
    `    bore-${name}-https:`,
    "      entryPoints:",
    "        - websecure",
    `      rule: \"${rule}\"`,
    `      service: ${serviceName}`,
    "      tls:",
    `        certResolver: ${certificateResolver}`,
    "",
  ].join("\n");
}

export class TraefikManager {
  static readonly MANAGED_FILE_PREFIX = "managed-";
  #reconcileQueue?: Promise<void>;
  #pending?: Map<string, string>;
  #appliedSignature?: string;

  constructor(
    private readonly dynamicConfigDir: string,
    private readonly serviceName: string,
    private readonly certificateResolver: string,
    private readonly publicDomain: string,
  ) {}

  static create(config: ControlPlaneConfig): TraefikManager | undefined {
    if (!config.traefik.enabled) {
      return undefined;
    }

    return new TraefikManager(
      config.traefik.dynamicConfigDir,
      config.traefik.serviceName,
      config.traefik.certificateResolver,
      config.publicDomain,
    );
  }

  async reconcile(state: PersistedState): Promise<void> {
    const desired = new Map<string, string>();

    for (const reservation of Object.values(state.reservations)) {
      const accessHosts = Object.values(state.accessHosts)
        .filter((accessHost) => accessHost.reservationId === reservation.id)
        .map((accessHost) => accessHost.hostname)
        .sort();
      const filename = `${TraefikManager.MANAGED_FILE_PREFIX}${sanitizeName(reservation.subdomain)}.yml`;
      desired.set(
        filename,
        buildNamespaceConfig(
          this.publicDomain,
          this.serviceName,
          this.certificateResolver,
          reservation.subdomain,
          accessHosts,
        ),
      );
    }

    this.#pending = desired;
    if (!this.#reconcileQueue) {
      this.#reconcileQueue = Promise.resolve().then(async () => {
        try {
          while (this.#pending) {
            const next = this.#pending;
            this.#pending = undefined;
            const signature = JSON.stringify([...next].sort(([a], [b]) => a.localeCompare(b)));
            if (signature === this.#appliedSignature) continue;
            await this.writeConfig(next);
            this.#appliedSignature = signature;
          }
        } finally {
          this.#reconcileQueue = undefined;
        }
      });
    }
    await this.#reconcileQueue;
  }

  private async writeConfig(desired: Map<string, string>): Promise<void> {
    await mkdir(this.dynamicConfigDir, { recursive: true });

    const existing = new Set(
      (await readdir(this.dynamicConfigDir)).filter(
        (entry) =>
          entry.endsWith(".yml") && entry.startsWith(TraefikManager.MANAGED_FILE_PREFIX),
      ),
    );

    for (const [filename, contents] of desired) {
      const target = join(this.dynamicConfigDir, filename);
      existing.delete(filename);
      try {
        if (await readFile(target, "utf8") === contents) continue;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const temp = `${target}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;

      try {
        await writeFile(temp, contents, "utf8");
        await rename(temp, target);
      } catch (error) {
        await rm(temp, { force: true });
        throw error;
      }
    }

    for (const filename of existing) {
      await rm(join(this.dynamicConfigDir, filename), { force: true });
    }
  }
}
