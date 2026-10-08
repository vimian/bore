import { randomBytes,randomUUID,scrypt,timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { query,transaction } from "./client.js";
import { mapUser,normalizeEmail } from "./users.js";

const deriveKey = promisify(scrypt);
export const SESSION_COOKIE_NAME = "bore_session";

export async function createUserAccount(input) {
  const email = normalizeEmail(input.email);
  if (input.password.length < 8) throw new Error("Password must be at least 8 characters.");
  const salt = randomBytes(16).toString("hex");
  const hash = (await deriveKey(input.password,salt,64)).toString("hex");
  try {
    return await transaction(async (client) => {
      const now = new Date().toISOString();
      const id = randomUUID();
      const result = await client.query("INSERT INTO users VALUES ($1,$2,$3,2,5,$4,$4) RETURNING *", [id,email,input.name?.trim() || email,now]);
      await client.query("INSERT INTO user_credentials VALUES ($1,$2,$3,$4)", [id,hash,salt,now]);
      return mapUser(result.rows[0]);
    });
  } catch (error) { if (error.code === "23505") throw new Error("A user with that email already exists."); throw error; }
}

export async function authenticateUser(email, password) {
  const result = await query(`SELECT users.*,password_hash,password_salt FROM users
    JOIN user_credentials ON user_credentials.user_id=users.id WHERE email=$1`, [normalizeEmail(email)]);
  const row = result.rows[0];
  if (!row) return null;
  const actual = await deriveKey(password,row.password_salt,64);
  const expected = Buffer.from(row.password_hash,"hex");
  return expected.length === actual.length && timingSafeEqual(actual,expected) ? mapUser(row) : null;
}

export async function createSession(userId) {
  const token = randomUUID();
  const now = new Date();
  await query("DELETE FROM sessions WHERE expires_at<=$1", [now.toISOString()]);
  await query("INSERT INTO sessions VALUES ($1,$2,$3,$4)", [token,userId,new Date(now.getTime()+30*86400_000).toISOString(),now.toISOString()]);
  return token;
}
export async function deleteSession(token) { await query("DELETE FROM sessions WHERE id=$1", [token]); }
export async function getUserBySessionToken(token) {
  const result = await query("SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.id=$1 AND expires_at>$2", [token,new Date().toISOString()]);
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}
