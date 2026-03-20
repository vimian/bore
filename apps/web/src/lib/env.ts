export function getControlPlaneOrigin(): string {
  return process.env.BORE_CONTROL_PLANE_ORIGIN ?? "http://localhost:8787";
}

export function getPublicDomain(): string {
  return process.env.BORE_PUBLIC_DOMAIN ?? "bore.localhost";
}
