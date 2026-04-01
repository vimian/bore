function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}

function isInternalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    !normalized.includes(".")
  );
}

export function getControlPlaneOrigin(): string {
  const configuredOrigin = process.env.BORE_CONTROL_PLANE_ORIGIN?.trim();

  if (configuredOrigin) {
    const normalizedOrigin = normalizeOrigin(configuredOrigin);

    if (process.env.NODE_ENV === "production") {
      try {
        const configuredHostname = new URL(normalizedOrigin).hostname;

        if (isInternalHostname(configuredHostname)) {
          return getSiteOrigin();
        }
      } catch {
        return normalizedOrigin;
      }
    }

    return normalizedOrigin;
  }

  return process.env.NODE_ENV === "production"
    ? getSiteOrigin()
    : "http://localhost:8787";
}

export function getPublicDomain(): string {
  return process.env.BORE_PUBLIC_DOMAIN ?? "bore.localhost";
}

export function getSiteOrigin(): string {
  const configuredOrigin = process.env.BORE_SITE_ORIGIN?.trim();
  if (configuredOrigin) {
    return normalizeOrigin(configuredOrigin);
  }

  if (process.env.NODE_ENV === "production") {
    return "https://bore.dk";
  }

  return "http://localhost:3000";
}
