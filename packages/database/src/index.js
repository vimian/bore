export { query,transaction,closeDatabase,getPool } from "./client.js";
export { ensureSchema } from "./schema.js";
export { listUsers,getUserById,getUserByEmail,upsertUser,setUserLimit } from "./users.js";
export { SESSION_COOKIE_NAME,createUserAccount,authenticateUser,createSession,deleteSession,getUserBySessionToken } from "./auth.js";
import { query } from "./client.js";

export async function readState() {
  const { rows } = await query("SELECT value,revision FROM app_state WHERE key='primary'");
  if (!rows[0]) throw new Error("Primary PostgreSQL state is missing");
  return { value: rows[0].value,revision: String(rows[0].revision) };
}
export async function readTraffic(ids) {
  if (!ids.length) return [];
  return (await query("SELECT kind,id,value FROM traffic_history WHERE id=ANY($1::text[])", [ids])).rows;
}
