import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

type TlsMode = "off" | "acme";
type DnsRecordType = "A" | "AAAA" | "CNAME";

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface ControlPlaneConfig {
  host: string;
  port: number;
  httpRedirectPort?: number;
  serverOrigin: string;
  webOrigin: string;
  publicDomain: string;
  dbPath: string;
  tokenSecret: string;
  tls: {
    mode: TlsMode;
    acmeDirectoryUrl: string;
    acmeEmail?: string;
    acmeAccountKeyPath: string;
    acmeCacheDir: string;
    acmePropagationSeconds: number;
    acmeRenewDays: number;
    dnsCommand?: string;
    dnsTtl: number;
    ingressRecordType: DnsRecordType;
    ingressRecordValue?: string;
  };
  traefik: {
    enabled: boolean;
    dynamicConfigDir: string;
    serviceName: string;
    certificateResolver: string;
  };
}

export function loadConfig(): ControlPlaneConfig {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const tlsMode = (process.env.BORE_TLS_MODE ?? "off") as TlsMode;
  const port = parseNumber(process.env.PORT, tlsMode === "off" ? 8787 : 443);
  const host = process.env.HOST ?? "0.0.0.0";
  const serverOrigin = process.env.BORE_SERVER_ORIGIN ?? `http://localhost:${port}`;
  const webOrigin = process.env.BORE_WEB_ORIGIN ?? "http://localhost:3000";
  const publicDomain = (process.env.BORE_PUBLIC_DOMAIN ?? "bore.localhost").toLowerCase();
  const dbPath =
    process.env.BORE_DB_PATH ??
    resolve(repoRoot, ".data", "bore.sqlite");
  const tokenSecret =
    process.env.BORE_TOKEN_SECRET ?? "dev-only-secret-change-me";
  const dataDir = resolve(dbPath, "..");
  const httpRedirectPort =
    tlsMode === "off"
      ? undefined
      : parseBoolean(process.env.BORE_DISABLE_HTTP_REDIRECT, false)
        ? undefined
        : parseNumber(process.env.BORE_HTTP_PORT, 80);

  return {
    host,
    port,
    httpRedirectPort,
    serverOrigin,
    webOrigin,
    publicDomain,
    dbPath,
    tokenSecret,
    tls: {
      mode: tlsMode,
      acmeDirectoryUrl:
        process.env.BORE_ACME_DIRECTORY_URL ??
        "https://acme-v02.api.letsencrypt.org/directory",
      acmeEmail: process.env.BORE_ACME_EMAIL,
      acmeAccountKeyPath:
        process.env.BORE_ACME_ACCOUNT_KEY_PATH ??
        resolve(dataDir, "acme-account.pem"),
      acmeCacheDir:
        process.env.BORE_ACME_CACHE_DIR ??
        resolve(dataDir, "tls"),
      acmePropagationSeconds: parseNumber(process.env.BORE_ACME_PROPAGATION_SECONDS, 15),
      acmeRenewDays: parseNumber(process.env.BORE_ACME_RENEW_DAYS, 30),
      dnsCommand: process.env.BORE_DNS_COMMAND,
      dnsTtl: parseNumber(process.env.BORE_DNS_TTL, 60),
      ingressRecordType: (process.env.BORE_INGRESS_RECORD_TYPE ?? "CNAME") as DnsRecordType,
      ingressRecordValue: process.env.BORE_INGRESS_RECORD_VALUE,
    },
    traefik: {
      enabled: parseBoolean(process.env.BORE_TRAEFIK_ENABLED, false),
      dynamicConfigDir:
        process.env.BORE_TRAEFIK_DYNAMIC_DIR ??
        resolve(repoRoot, "traefik", "dynamic", "runtime"),
      serviceName: process.env.BORE_TRAEFIK_SERVICE_NAME ?? "bore-service",
      certificateResolver: process.env.BORE_TRAEFIK_CERTIFICATE_RESOLVER ?? "letsencrypt",
    },
  };
}
