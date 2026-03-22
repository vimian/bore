export function getControlPlaneOrigin(): string {
  return process.env.BORE_CONTROL_PLANE_ORIGIN ?? "http://localhost:8787";
}

export function getPublicDomain(): string {
  return process.env.BORE_PUBLIC_DOMAIN ?? "bore.localhost";
}

export function getSiteOrigin(): string {
  const configuredOrigin = process.env.BORE_SITE_ORIGIN?.trim();
  if (configuredOrigin) {
    return configuredOrigin.replace(/\/+$/, "");
  }

  if (process.env.NODE_ENV === "production") {
    return "https://bore.dk";
  }

  return "http://localhost:3000";
}
