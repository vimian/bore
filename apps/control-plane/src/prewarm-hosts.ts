import type { PersistedState } from "./types.js";

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

    hostnames.add(`${reservation.subdomain}.${publicDomain}`.toLowerCase());

    for (const accessHost of Object.values(state.accessHosts)) {
      if (accessHost.reservationId !== reservationId) {
        continue;
      }

      hostnames.add(`${accessHost.hostname}.${publicDomain}`.toLowerCase());
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
