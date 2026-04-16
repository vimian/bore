import type { PersistedState } from "./types.js";
import { buildPublicHostnameVariants } from "./public-hosts.js";

export function listDevicePublicHostnames(
  state: PersistedState,
  deviceId: string,
  publicDomain: string,
): string[] {
  const reservationIds = new Set(
    Object.values(state.deviceTunnels)
      .filter((tunnel) => tunnel.deviceId === deviceId)
      .map((tunnel) => tunnel.reservationId),
  );
  const hostnames = new Set<string>();

  for (const reservationId of reservationIds) {
    const reservation = state.reservations[reservationId];

    if (!reservation) {
      continue;
    }

    for (const hostname of buildPublicHostnameVariants(reservation.subdomain, publicDomain)) {
      hostnames.add(hostname);
    }

    for (const accessHost of Object.values(state.accessHosts)) {
      if (accessHost.reservationId !== reservationId) {
        continue;
      }

      for (const hostname of buildPublicHostnameVariants(accessHost.hostname, publicDomain)) {
        hostnames.add(hostname);
      }
    }
  }

  return [...hostnames].sort();
}

export function diffAddedHostnames(previous: string[], next: string[]): string[] {
  const previousSet = new Set(previous.map((hostname) => hostname.toLowerCase()));

  return [...new Set(next.map((hostname) => hostname.toLowerCase()))]
    .filter((hostname) => !previousSet.has(hostname))
    .sort();
}
