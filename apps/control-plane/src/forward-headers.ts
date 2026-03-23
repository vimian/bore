import type { IncomingMessage } from "node:http";

const STRIPPED_REQUEST_HEADERS = new Set([
  "connection",
  "content-length",
  "forwarded",
  "host",
  "x-real-ip",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
]);

function readFirstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function quoteForwardedValue(value: string): string {
  return `"${value.replace(/(["\\])/g, "\\$1")}"`;
}

function formatForwardedFor(ipAddress: string): string {
  return ipAddress.includes(":") ? quoteForwardedValue(`[${ipAddress}]`) : ipAddress;
}

export function buildForwardedHeader(
  publicHost: string,
  forwardedProto: string,
  clientIp: string | undefined,
): string {
  const parts = [`host=${quoteForwardedValue(publicHost)}`, `proto=${forwardedProto}`];

  if (clientIp) {
    parts.unshift(`for=${formatForwardedFor(clientIp)}`);
  }

  return parts.join(";");
}

export function sanitizeForwardHeaders(
  headers: IncomingMessage["headers"],
  publicHost: string,
  tunnelSubdomain: string,
  forwardedProto: string,
  clientIp: string | undefined,
): Record<string, string[]> {
  const forwarded: Record<string, string[]> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (!value) {
      continue;
    }

    if (STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) {
      continue;
    }

    forwarded[key] = Array.isArray(value) ? value : [value];
  }

  const canonicalClientIp = clientIp?.trim();
  if (canonicalClientIp) {
    forwarded["x-real-ip"] = [canonicalClientIp];
    forwarded["x-forwarded-for"] = [canonicalClientIp];
  }

  forwarded.forwarded = [buildForwardedHeader(publicHost, forwardedProto, canonicalClientIp)];
  forwarded["x-forwarded-host"] = [publicHost];
  forwarded["x-forwarded-proto"] = [forwardedProto];
  forwarded["x-bore-original-host"] = [publicHost];
  forwarded["x-bore-tunnel-root"] = [tunnelSubdomain];
  return forwarded;
}

export function getForwardedProto(request: IncomingMessage): string {
  const forwarded = readFirstHeaderValue(request.headers["x-forwarded-proto"]);

  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",").at(-1)?.trim() ?? "https";
  }

  return "encrypted" in request.socket && request.socket.encrypted ? "https" : "http";
}

export function getClientIp(request: IncomingMessage): string | undefined {
  const realIp = readFirstHeaderValue(request.headers["x-real-ip"]);

  if (typeof realIp === "string" && realIp.trim()) {
    return realIp.trim();
  }

  const forwardedFor = readFirstHeaderValue(request.headers["x-forwarded-for"]);

  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return (
      forwardedFor
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .at(-1)
    );
  }

  return request.socket.remoteAddress?.trim();
}
