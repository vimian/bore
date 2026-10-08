import { randomUUID } from "node:crypto";
import { query, transaction } from "./client.js";

export const normalizeEmail = (email) => email.trim().toLowerCase();
export function mapUser(row) {
  return { id: row.id,email: row.email,name: row.name,reservationLimit: row.reservation_limit,
    accessHostLimit: row.access_host_limit,createdAt: row.created_at,updatedAt: row.updated_at };
}
export async function listUsers() { return (await query("SELECT * FROM users")).rows.map(mapUser); }
export async function getUserById(id) { const result = await query("SELECT * FROM users WHERE id=$1", [id]); return result.rows[0] ? mapUser(result.rows[0]) : null; }
export async function getUserByEmail(email) { const result = await query("SELECT * FROM users WHERE email=$1", [normalizeEmail(email)]); return result.rows[0] ? mapUser(result.rows[0]) : null; }

export async function upsertUser(input) {
  const email = normalizeEmail(input.email);
  return transaction(async (client) => {
    // Serialize new accounts too, where there is no existing row available to lock.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`bore:user-email:${email}`]);
    const candidates = await client.query("SELECT * FROM users WHERE id=$1 OR email=$2 ORDER BY id FOR UPDATE", [input.id ?? null,email]);
    const existing = candidates.rows.find((row) => row.id === input.id) ?? candidates.rows.find((row) => row.email === email);
    const now = new Date().toISOString();
    const values = [existing?.id ?? input.id ?? randomUUID(),email,input.name?.trim() || existing?.name || email,
      input.reservationLimit ?? existing?.reservation_limit ?? 2,input.accessHostLimit ?? existing?.access_host_limit ?? 5,existing?.created_at ?? now,now];
    const result = await client.query(`INSERT INTO users (id,email,name,reservation_limit,access_host_limit,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET
      email=excluded.email,name=excluded.name,
      reservation_limit=COALESCE($8,users.reservation_limit),access_host_limit=COALESCE($9,users.access_host_limit),
      updated_at=excluded.updated_at RETURNING *`, [...values,input.reservationLimit ?? null,input.accessHostLimit ?? null]);
    return mapUser(result.rows[0]);
  });
}

export async function setUserLimit(email, field, limit) {
  if (!Number.isInteger(limit) || limit < 0) throw new Error("Limit must be a non-negative integer");
  if (!["reservation_limit", "access_host_limit"].includes(field)) throw new Error("Unknown quota field");
  const result = await query(`UPDATE users SET ${field}=$1,updated_at=$2 WHERE email=$3 RETURNING *`, [limit,new Date().toISOString(),normalizeEmail(email)]);
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}
