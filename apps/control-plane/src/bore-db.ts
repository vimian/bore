import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import {
  CONTROL_PLANE_STATE_KEY,
  DEFAULT_ACCESS_HOST_LIMIT,
  DEFAULT_RESERVATION_LIMIT,
  emptyState,
  type DashboardOverview,
  buildDashboardOverview,
} from "./state-model.js";
import type { PersistedState, UserRecord } from "./types.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const defaultDbPath = resolve(repoRoot, ".data", "bore.sqlite");
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE_NAME = "bore_session";

type StoredState = Omit<PersistedState, "users">;
type UserRow = {
  id: string;
  email: string;
  name: string;
  reservation_limit: number;
  access_host_limit: number;
  created_at: string;
  updated_at: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __boreSqlite: Map<string, DatabaseSync> | undefined;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getDbPath(explicitPath?: string): string {
  return explicitPath ?? process.env.BORE_DB_PATH ?? defaultDbPath;
}

function ensureSchema(db: DatabaseSync): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      reservation_limit INTEGER NOT NULL DEFAULT ${DEFAULT_RESERVATION_LIMIT},
      access_host_limit INTEGER NOT NULL DEFAULT ${DEFAULT_ACCESS_HOST_LIMIT},
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_credentials (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const userColumns = new Set(
    (db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>).map((row) => row.name),
  );

  if (!userColumns.has("access_host_limit")) {
    db.exec(`
      ALTER TABLE users
      ADD COLUMN access_host_limit INTEGER NOT NULL DEFAULT ${DEFAULT_ACCESS_HOST_LIMIT}
    `);
  }
}

function getDatabase(explicitPath?: string): DatabaseSync {
  const dbPath = getDbPath(explicitPath);
  const databases = globalThis.__boreSqlite ?? new Map<string, DatabaseSync>();
  globalThis.__boreSqlite = databases;

  const existing = databases.get(dbPath);

  if (existing) {
    return existing;
  }

  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  ensureSchema(db);
  databases.set(dbPath, db);
  return db;
}

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    reservationLimit: row.reservation_limit,
    accessHostLimit: row.access_host_limit,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function loadUsers(db: DatabaseSync): Record<string, UserRecord> {
  const rows = db
    .prepare(
      `SELECT id, email, name, reservation_limit, access_host_limit, created_at, updated_at
       FROM users`,
    )
    .all() as UserRow[];

  return Object.fromEntries(rows.map((row) => [row.id, mapUser(row)]));
}

function loadStoredState(db: DatabaseSync): StoredState {
  const row = db
    .prepare(`SELECT value FROM app_state WHERE key = ?`)
    .get(CONTROL_PLANE_STATE_KEY) as { value: string } | undefined;

  if (!row) {
    const initial = emptyState();

    return {
      devices: initial.devices,
      reservations: initial.reservations,
      accessHosts: initial.accessHosts,
      deviceTunnels: initial.deviceTunnels,
      pendingCliAuth: initial.pendingCliAuth,
      deviceConnections: initial.deviceConnections,
    };
  }

  const parsed = JSON.parse(row.value) as Partial<StoredState>;
  const initial = emptyState();

  return {
    devices: parsed.devices ?? initial.devices,
    reservations: parsed.reservations ?? initial.reservations,
    accessHosts: parsed.accessHosts ?? initial.accessHosts,
    deviceTunnels: parsed.deviceTunnels ?? initial.deviceTunnels,
    pendingCliAuth: parsed.pendingCliAuth ?? initial.pendingCliAuth,
    deviceConnections: parsed.deviceConnections ?? initial.deviceConnections,
  };
}

function persistUsers(db: DatabaseSync, users: Record<string, UserRecord>): void {
  const upsert = db.prepare(`
    INSERT INTO users (id, email, name, reservation_limit, access_host_limit, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      email = excluded.email,
      name = excluded.name,
      reservation_limit = excluded.reservation_limit,
      access_host_limit = excluded.access_host_limit,
      updated_at = excluded.updated_at
  `);

  for (const user of Object.values(users)) {
    upsert.run(
      user.id,
      normalizeEmail(user.email),
      user.name,
      user.reservationLimit,
      user.accessHostLimit,
      user.createdAt,
      user.updatedAt,
    );
  }
}

function persistStoredState(db: DatabaseSync, state: PersistedState): void {
  const payload = JSON.stringify({
    devices: state.devices,
    reservations: state.reservations,
    accessHosts: state.accessHosts,
    deviceTunnels: state.deviceTunnels,
    pendingCliAuth: state.pendingCliAuth,
    deviceConnections: state.deviceConnections,
  } satisfies StoredState);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO app_state (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(CONTROL_PLANE_STATE_KEY, payload, now);
}

function withTransaction<T>(db: DatabaseSync, operation: () => T): T {
  db.exec("BEGIN IMMEDIATE");

  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function cleanupExpiredSessions(db: DatabaseSync): void {
  db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`).run(new Date().toISOString());
}

function hashPassword(password: string, salt = randomBytes(16).toString("hex")): {
  salt: string;
  hash: string;
} {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const actualHash = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, "hex");
  return actualHash.length === expected.length && timingSafeEqual(actualHash, expected);
}

export function readSnapshot(dbPath?: string): PersistedState {
  const db = getDatabase(dbPath);
  return {
    users: loadUsers(db),
    ...loadStoredState(db),
  };
}

export function writeSnapshot(state: PersistedState, dbPath?: string): PersistedState {
  const db = getDatabase(dbPath);

  return withTransaction(db, () => {
    persistUsers(db, state.users);
    persistStoredState(db, state);
    return readSnapshot(dbPath);
  });
}

export function createUserAccount(
  input: {
    email: string;
    password: string;
    name?: string;
  },
  dbPath?: string,
): UserRecord {
  const db = getDatabase(dbPath);
  const email = normalizeEmail(input.email);

  if (input.password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  return withTransaction(db, () => {
    const existing = db
      .prepare(`SELECT id FROM users WHERE email = ?`)
      .get(email) as { id: string } | undefined;

    if (existing) {
      throw new Error("A user with that email already exists.");
    }

    const now = new Date().toISOString();
    const user: UserRecord = {
      id: randomUUID(),
      email,
      name: input.name?.trim() || email,
      reservationLimit: DEFAULT_RESERVATION_LIMIT,
      accessHostLimit: DEFAULT_ACCESS_HOST_LIMIT,
      createdAt: now,
      updatedAt: now,
    };
    const password = hashPassword(input.password);

    persistUsers(db, { [user.id]: user });
    db.prepare(`
      INSERT INTO user_credentials (user_id, password_hash, password_salt, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(user.id, password.hash, password.salt, now);

    return user;
  });
}

export function authenticateUser(
  emailInput: string,
  password: string,
  dbPath?: string,
): UserRecord | null {
  const db = getDatabase(dbPath);
  const email = normalizeEmail(emailInput);
  cleanupExpiredSessions(db);
  const row = db
    .prepare(`
      SELECT
        users.id,
        users.email,
        users.name,
        users.reservation_limit,
        users.access_host_limit,
        users.created_at,
        users.updated_at,
        user_credentials.password_hash,
        user_credentials.password_salt
      FROM users
      JOIN user_credentials ON user_credentials.user_id = users.id
      WHERE users.email = ?
    `)
    .get(email) as
    | (UserRow & {
        password_hash: string;
        password_salt: string;
      })
    | undefined;

  if (!row || !verifyPassword(password, row.password_salt, row.password_hash)) {
    return null;
  }

  return mapUser(row);
}

export function createSession(userId: string, dbPath?: string): string {
  const db = getDatabase(dbPath);
  cleanupExpiredSessions(db);
  const token = randomUUID();
  const now = new Date();
  db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(
    token,
    userId,
    new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
    now.toISOString(),
  );
  return token;
}

export function deleteSession(sessionId: string, dbPath?: string): void {
  const db = getDatabase(dbPath);
  db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
}

export function getUserBySessionToken(
  sessionId: string,
  dbPath?: string,
): UserRecord | null {
  const db = getDatabase(dbPath);
  cleanupExpiredSessions(db);
  const row = db
    .prepare(`
      SELECT
        users.id,
        users.email,
        users.name,
        users.reservation_limit,
        users.access_host_limit,
        users.created_at,
        users.updated_at
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.id = ? AND sessions.expires_at > ?
    `)
    .get(sessionId, new Date().toISOString()) as UserRow | undefined;

  return row ? mapUser(row) : null;
}

export function getUserByEmail(emailInput: string, dbPath?: string): UserRecord | null {
  const db = getDatabase(dbPath);
  const row = db
    .prepare(`
      SELECT id, email, name, reservation_limit, access_host_limit, created_at, updated_at
      FROM users
      WHERE email = ?
    `)
    .get(normalizeEmail(emailInput)) as UserRow | undefined;

  return row ? mapUser(row) : null;
}

export function getUserById(userId: string, dbPath?: string): UserRecord | null {
  const db = getDatabase(dbPath);
  const row = db
    .prepare(`
      SELECT id, email, name, reservation_limit, access_host_limit, created_at, updated_at
      FROM users
      WHERE id = ?
    `)
    .get(userId) as UserRow | undefined;

  return row ? mapUser(row) : null;
}

export function upsertUser(
  input: {
    id?: string;
    email: string;
    name?: string;
    reservationLimit?: number;
    accessHostLimit?: number;
  },
  dbPath?: string,
): UserRecord {
  const snapshot = readSnapshot(dbPath);
  const now = new Date().toISOString();
  const email = normalizeEmail(input.email);
  const existing =
    (input.id ? snapshot.users[input.id] : null) ??
    Object.values(snapshot.users).find((user) => user.email === email) ??
    null;

  const user: UserRecord = existing
    ? {
        ...existing,
        email,
        name: input.name?.trim() || existing.name || email,
        reservationLimit:
          input.reservationLimit ?? existing.reservationLimit ?? DEFAULT_RESERVATION_LIMIT,
        accessHostLimit:
          input.accessHostLimit ?? existing.accessHostLimit ?? DEFAULT_ACCESS_HOST_LIMIT,
        updatedAt: now,
      }
    : {
        id: input.id ?? randomUUID(),
        email,
        name: input.name?.trim() || email,
        reservationLimit: input.reservationLimit ?? DEFAULT_RESERVATION_LIMIT,
        accessHostLimit: input.accessHostLimit ?? DEFAULT_ACCESS_HOST_LIMIT,
        createdAt: now,
        updatedAt: now,
      };

  snapshot.users[user.id] = user;
  writeSnapshot(snapshot, dbPath);
  return user;
}

export function setUserReservationLimitByEmail(
  emailInput: string,
  reservationLimit: number,
  dbPath?: string,
): UserRecord | null {
  if (!Number.isInteger(reservationLimit) || reservationLimit < 0) {
    throw new Error("reservationLimit must be a non-negative integer");
  }

  const user = getUserByEmail(emailInput, dbPath);

  if (!user) {
    return null;
  }

  return upsertUser(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      reservationLimit,
      accessHostLimit: user.accessHostLimit,
    },
    dbPath,
  );
}

export function setUserAccessHostLimitByEmail(
  emailInput: string,
  accessHostLimit: number,
  dbPath?: string,
): UserRecord | null {
  if (!Number.isInteger(accessHostLimit) || accessHostLimit < 0) {
    throw new Error("accessHostLimit must be a non-negative integer");
  }

  const user = getUserByEmail(emailInput, dbPath);

  if (!user) {
    return null;
  }

  return upsertUser(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      reservationLimit: user.reservationLimit,
      accessHostLimit,
    },
    dbPath,
  );
}

export function getDashboardOverview(
  userId: string,
  publicDomain: string,
  dbPath?: string,
): DashboardOverview {
  const snapshot = readSnapshot(dbPath);
  const user = snapshot.users[userId];

  if (!user) {
    throw new Error(`Unknown user ${userId}`);
  }

  return buildDashboardOverview(snapshot, user, publicDomain);
}
