import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { ServerOptions as HttpsServerOptions } from "node:https";
import { dirname, join } from "node:path";
import { createSecureContext, type SecureContext } from "node:tls";

import * as acme from "acme-client";

import type { ControlPlaneConfig } from "./config.js";
import { DnsAutomation, type DnsRecordType } from "./dns-automation.js";
import {
  buildPublicHostnameVariants,
  extractPublicHostNamespace,
  listPublicHostRoots,
} from "./public-hosts.js";

interface CachedCertificate {
  key: string;
  cert: string;
  notAfter: Date;
  secureContext: SecureContext;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePem(input: Buffer | string): string {
  return Buffer.isBuffer(input) ? input.toString("utf8") : input;
}

export class TlsManager {
  readonly #dns: DnsAutomation;
  readonly #locks = new Map<string, Promise<void>>();
  readonly #namespaceCertificates = new Map<string, CachedCertificate>();
  #defaultCertificate?: CachedCertificate;

  constructor(private readonly config: ControlPlaneConfig) {
    this.#dns = new DnsAutomation(config.tls.dnsCommand);
  }

  static async create(config: ControlPlaneConfig): Promise<TlsManager | undefined> {
    if (config.tls.mode === "off") {
      return undefined;
    }

    if (!config.tls.acmeEmail) {
      throw new Error("BORE_ACME_EMAIL is required when BORE_TLS_MODE=acme");
    }

    if (!config.tls.dnsCommand) {
      throw new Error("BORE_DNS_COMMAND is required when BORE_TLS_MODE=acme");
    }

    if (new URL(config.serverOrigin).protocol !== "https:") {
      throw new Error("BORE_SERVER_ORIGIN must use https when BORE_TLS_MODE=acme");
    }

    const manager = new TlsManager(config);
    await manager.ensureDefaultCertificate();
    return manager;
  }

  getHttpsOptions(): HttpsServerOptions {
    if (!this.#defaultCertificate) {
      throw new Error("Default TLS certificate is not ready");
    }

    return {
      key: this.#defaultCertificate.key,
      cert: this.#defaultCertificate.cert,
      SNICallback: (servername, callback) => {
        try {
          callback(null, this.getSecureContext(servername));
        } catch (error) {
          callback(error instanceof Error ? error : new Error("Unable to resolve TLS context"));
        }
      },
    };
  }

  async ensureDefaultCertificate(): Promise<void> {
    await this.withLock("default", async () => {
      await this.ensureDefaultIngressRecords();
      const certificate = await this.ensureCertificate(
        this.getDefaultCertificateCacheDir(),
        this.getDefaultCertificateNames(),
      );
      this.#defaultCertificate = certificate;
    });
  }

  async ensureNamespace(subdomain: string): Promise<void> {
    await this.withLock(`namespace:${subdomain}`, async () => {
      await this.ensureIngressRecords(subdomain);
      const certificate = await this.ensureCertificate(
        this.getNamespaceCertificateCacheDir(subdomain),
        this.getNamespaceCertificateNames(subdomain),
      );
      this.#namespaceCertificates.set(subdomain, certificate);
    });
  }

  getSecureContext(servername: string): SecureContext {
    const exactNamespace = this.extractNamespace(servername);

    if (exactNamespace) {
      const labels = exactNamespace.split(".");

      for (let index = 0; index < labels.length; index += 1) {
        const candidate = labels.slice(index).join(".");
        const certificate = this.#namespaceCertificates.get(candidate);

        if (certificate) {
          return certificate.secureContext;
        }
      }
    }

    if (!this.#defaultCertificate) {
      throw new Error("Default TLS certificate is not ready");
    }

    return this.#defaultCertificate.secureContext;
  }

  private async ensureDefaultIngressRecords(): Promise<void> {
    const value = this.config.tls.ingressRecordValue;

    if (!value) {
      return;
    }

    const type = this.config.tls.ingressRecordType as DnsRecordType;
    const ttl = this.config.tls.dnsTtl;
    const aliasRoots = listPublicHostRoots(this.config.publicDomain).filter(
      (host) => host !== this.config.publicDomain,
    );

    await Promise.all(
      aliasRoots.flatMap((host) => [
        this.#dns.upsertRecord({
          name: host,
          type,
          value,
          ttl,
        }),
        this.#dns.upsertRecord({
          name: `*.${host}`,
          type,
          value,
          ttl,
        }),
      ]),
    );
  }

  private async ensureIngressRecords(subdomain: string): Promise<void> {
    const value = this.config.tls.ingressRecordValue;

    if (!value) {
      return;
    }

    const type = this.config.tls.ingressRecordType as DnsRecordType;
    const ttl = this.config.tls.dnsTtl;

    await Promise.all(
      buildPublicHostnameVariants(subdomain, this.config.publicDomain).flatMap((fqdn) => [
        this.#dns.upsertRecord({
          name: fqdn,
          type,
          value,
          ttl,
        }),
        this.#dns.upsertRecord({
          name: `*.${fqdn}`,
          type,
          value,
          ttl,
        }),
      ]),
    );
  }

  private async ensureCertificate(cacheDir: string, names: string[]): Promise<CachedCertificate> {
    const cached = await this.loadCachedCertificate(cacheDir);

    if (cached && !this.needsRenewal(cached.notAfter)) {
      return cached;
    }

    const { key, cert } = await this.issueCertificate(names);
    await mkdir(cacheDir, { recursive: true });
    await Promise.all([
      writeFile(join(cacheDir, "key.pem"), key, "utf8"),
      writeFile(join(cacheDir, "cert.pem"), cert, "utf8"),
    ]);

    return this.buildCachedCertificate(key, cert);
  }

  private async loadCachedCertificate(cacheDir: string): Promise<CachedCertificate | undefined> {
    try {
      const [key, cert] = await Promise.all([
        readFile(join(cacheDir, "key.pem"), "utf8"),
        readFile(join(cacheDir, "cert.pem"), "utf8"),
      ]);

      return this.buildCachedCertificate(key, cert);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;

      if (err.code === "ENOENT") {
        return undefined;
      }

      throw err;
    }
  }

  private buildCachedCertificate(key: string, cert: string): CachedCertificate {
    const info = acme.crypto.readCertificateInfo(cert);

    return {
      key,
      cert,
      notAfter: info.notAfter,
      secureContext: createSecureContext({ key, cert }),
    };
  }

  private needsRenewal(notAfter: Date): boolean {
    const renewalWindowMs = this.config.tls.acmeRenewDays * 24 * 60 * 60 * 1000;
    return notAfter.getTime() - renewalWindowMs <= Date.now();
  }

  private async issueCertificate(names: string[]): Promise<{ key: string; cert: string }> {
    const accountKey = await this.loadOrCreateAccountKey();
    const client = new acme.Client({
      directoryUrl: this.config.tls.acmeDirectoryUrl,
      accountKey,
    });
    const [certificateKey, csr] = await acme.crypto.createCsr(
      {
        commonName: names[0],
        altNames: names,
      },
      await acme.crypto.createPrivateEcdsaKey(),
    );
    const certificate = await client.auto({
      csr,
      email: this.config.tls.acmeEmail,
      termsOfServiceAgreed: true,
      challengePriority: ["dns-01"],
      challengeCreateFn: async (authz, _challenge, keyAuthorization) => {
        await this.#dns.upsertRecord({
          name: `_acme-challenge.${authz.identifier.value.replace(/^\*\./, "")}`,
          type: "TXT",
          value: keyAuthorization,
          ttl: this.config.tls.dnsTtl,
        });

        if (this.config.tls.acmePropagationSeconds > 0) {
          await delay(this.config.tls.acmePropagationSeconds * 1000);
        }
      },
      challengeRemoveFn: async (authz, _challenge, keyAuthorization) => {
        await this.#dns.deleteRecord({
          name: `_acme-challenge.${authz.identifier.value.replace(/^\*\./, "")}`,
          type: "TXT",
          value: keyAuthorization,
          ttl: this.config.tls.dnsTtl,
        });
      },
    });

    return {
      key: normalizePem(certificateKey),
      cert: certificate,
    };
  }

  private async loadOrCreateAccountKey(): Promise<string> {
    try {
      return await readFile(this.config.tls.acmeAccountKeyPath, "utf8");
    } catch (error) {
      const err = error as NodeJS.ErrnoException;

      if (err.code !== "ENOENT") {
        throw err;
      }
    }

    const key = normalizePem(await acme.crypto.createPrivateEcdsaKey());
    await mkdir(dirname(this.config.tls.acmeAccountKeyPath), { recursive: true });
    await writeFile(this.config.tls.acmeAccountKeyPath, key, "utf8");
    return key;
  }

  private extractNamespace(hostname: string): string | undefined {
    return extractPublicHostNamespace(hostname, this.config.publicDomain);
  }

  private getDefaultCertificateNames(): string[] {
    const host = new URL(this.config.serverOrigin).hostname;
    const publicHosts = listPublicHostRoots(this.config.publicDomain);

    return [
      ...new Set([
        ...publicHosts,
        ...publicHosts.map((publicHost) => `*.${publicHost}`),
        host,
      ]),
    ];
  }

  private getDefaultCertificateCacheDir(): string {
    return join(this.config.tls.acmeCacheDir, "default");
  }

  private getNamespaceCertificateNames(subdomain: string): string[] {
    return [
      ...new Set(
        buildPublicHostnameVariants(subdomain, this.config.publicDomain).flatMap((hostname) => [
          hostname,
          `*.${hostname}`,
        ]),
      ),
    ];
  }

  private getNamespaceCertificateCacheDir(subdomain: string): string {
    return join(this.config.tls.acmeCacheDir, "namespaces", subdomain);
  }

  private async withLock(key: string, task: () => Promise<void>): Promise<void> {
    const pending = this.#locks.get(key);

    if (pending) {
      await pending;
      return;
    }

    const running = task().finally(() => {
      this.#locks.delete(key);
    });
    this.#locks.set(key, running);
    await running;
  }
}
