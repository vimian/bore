const LOCAL_PUBLIC_HOST_ALIASES = ["l", "local", "localhost"] as const;

function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/\.+$/, "");
}

export function listPublicHostRoots(publicDomain: string): string[] {
  const normalizedPublicDomain = normalizeHostname(publicDomain);

  return [
    ...new Set([
      normalizedPublicDomain,
      ...LOCAL_PUBLIC_HOST_ALIASES.map((alias) => `${alias}.${normalizedPublicDomain}`),
    ]),
  ].sort();
}

export function buildPublicHostnameVariants(hostname: string, publicDomain: string): string[] {
  const normalizedHostname = normalizeHostname(hostname);

  return listPublicHostRoots(publicDomain)
    .map((root) => `${normalizedHostname}.${root}`)
    .sort();
}

export function isKnownPublicHostname(host: string, publicDomain: string): boolean {
  const normalizedHost = normalizeHostname(host);

  return listPublicHostRoots(publicDomain).some(
    (root) => normalizedHost === root || normalizedHost.endsWith(`.${root}`),
  );
}

export function extractPublicHostNamespace(
  host: string,
  publicDomain: string,
): string | undefined {
  const normalizedHost = normalizeHostname(host);
  const roots = listPublicHostRoots(publicDomain).sort((left, right) => right.length - left.length);

  for (const root of roots) {
    if (normalizedHost === root) {
      return undefined;
    }

    const suffix = `.${root}`;

    if (!normalizedHost.endsWith(suffix)) {
      continue;
    }

    const namespace = normalizedHost.slice(0, -suffix.length);
    return namespace || undefined;
  }

  return undefined;
}
