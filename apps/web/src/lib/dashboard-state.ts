import type { DashboardState, RequestStatsRecord } from "./dashboard-types";

export function normalizeDashboardState(value: Partial<DashboardState> | null): DashboardState {
  return {
    devices: value?.devices ?? {},
    reservations: value?.reservations ?? {},
    accessHosts: value?.accessHosts ?? {},
    deviceTunnels: value?.deviceTunnels ?? {},
    deviceConnections: value?.deviceConnections ?? {},
  };
}

export function viewerTrafficIds(state: DashboardState, userId: string): string[] {
  return [
    ...Object.values(state.reservations).filter((item) => item.userId === userId),
    ...Object.values(state.accessHosts).filter((item) => item.userId === userId),
  ].map((item) => item.id);
}

export function hydrateDashboardTraffic(
  state: DashboardState,
  userId: string,
  rows: Array<{ kind: string; id: string; value: unknown }>,
): void {
  for (const row of rows) {
    if (row.kind === "direct") {
      const reservation = state.reservations[row.id];
      if (reservation?.userId === userId) {
        reservation.directRequestStats = row.value as RequestStatsRecord;
      }
    } else if (row.kind === "child") {
      const host = state.accessHosts[row.id];
      if (host?.userId === userId) {
        host.requestStats = row.value as RequestStatsRecord;
      }
    }
  }
}
