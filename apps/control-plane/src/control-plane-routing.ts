export function normalizeRequestHost(hostHeader: string | undefined): string {
  return hostHeader?.split(":")[0]?.toLowerCase() ?? "";
}

export function isKnownPublicHost(host: string, publicDomain: string): boolean {
  return host === publicDomain || host.endsWith(`.${publicDomain}`);
}

function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1";
}
export function shouldHandleControlPlaneHttpRoute(
  hostHeader: string | undefined,
  pathname: string,
  publicDomain: string,
): boolean {
  const host = normalizeRequestHost(hostHeader);

  if (host === publicDomain) {
    return (
      pathname === "/health"
      || pathname === "/auth/cli/start"
      || pathname === "/auth/cli/complete"
      || pathname.startsWith("/api/")
    );
  }

  if (isLoopbackHost(host)) {
    return pathname === "/health";
  }

  return false;
}

export function shouldHandleControlPlaneWebSocketRoute(
  hostHeader: string | undefined,
  pathname: string,
  publicDomain: string,
): boolean {
  if (normalizeRequestHost(hostHeader) !== publicDomain) {
    return false;
  }

  return pathname === "/ws";
}
