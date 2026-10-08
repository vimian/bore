export { SESSION_COOKIE_NAME,createUserAccount,authenticateUser,createSession,deleteSession,
  getUserById,getUserByEmail,getUserBySessionToken,upsertUser } from "@bore/database";
import { setUserLimit } from "@bore/database";

export const setUserReservationLimitByEmail = (email:string,limit:number) => setUserLimit(email,"reservation_limit",limit);
export const setUserAccessHostLimitByEmail = (email:string,limit:number) => setUserLimit(email,"access_host_limit",limit);
