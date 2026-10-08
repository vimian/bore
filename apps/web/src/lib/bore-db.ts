import { getUserById, readState, readTraffic } from "@bore/database";
import { buildDashboardOverview } from "./dashboard-view";
import { hydrateDashboardTraffic, normalizeDashboardState, viewerTrafficIds } from "./dashboard-state";
import type { DashboardOverview, DashboardState } from "./dashboard-types";

export {
  SESSION_COOKIE_NAME,
  authenticateUser,
  createUserAccount,
  createSession,
  deleteSession,
  getUserBySessionToken,
  getUserById,
  getUserByEmail,
} from "@bore/database";
export type { UserRecord } from "@bore/database";
export type { DashboardOverview } from "./dashboard-types";

export async function getDashboardOverview(
  userId: string,
  publicDomain: string,
): Promise<DashboardOverview> {
  const user = await getUserById(userId);
  if (!user) {
    throw new Error(`Unknown user ${userId}`);
  }

  const { value } = await readState<Partial<DashboardState>>();
  const state = normalizeDashboardState(value);
  const ids = viewerTrafficIds(state, userId);
  if (ids.length > 0) {
    hydrateDashboardTraffic(state, userId, await readTraffic(ids));
  }
  return buildDashboardOverview(state, user, publicDomain);
}
