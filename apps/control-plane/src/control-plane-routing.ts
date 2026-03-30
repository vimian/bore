export function normalizeRequestHost(hostHeader: string | undefined): string {
  return hostHeader?.split(":")[0]?.toLowerCase() ?? "";
}

export function isKnownPublicHost(host: string, publicDomain: string): boolean {
  return host === publicDomain || host.endsWith(`.${publicDomain}`);
}

export function shouldHandleControlPlaneHttpRoute(
  hostHeader: string | undefined,
  pathname: string,
  publicDomain: string,
): boolean {
  const normalizedHost = normalizeRequestHost(hostHeader);

  if (pathname === "/health" && (normalizedHost === "127.0.0.1" || normalizedHost === "localhost")) {
    return true;
  }

  if (normalizedHost !== publicDomain) {
    return false;
  }

  return (
    pathname === "/health"
    || pathname === "/auth/cli/start"
    || pathname === "/auth/cli/complete"
    || pathname.startsWith("/api/")
  );
}

export function shouldHandleControlPlaneWebSocketRoute(
  hostHeader: string | undefined,
  pathname: string,
  publicDomain: string,
): boolean {
  return normalizeRequestHost(hostHeader) === publicDomain && pathname === "/ws";
}
