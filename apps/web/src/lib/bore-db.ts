import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const defaultDbPath = resolve(repoRoot, ".data", "bore.sqlite");
export const SESSION_COOKIE_NAME = "bore_session";
const DEFAULT_RESERVATION_LIMIT = 2;
const DEFAULT_ACCESS_HOST_LIMIT = 5;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type UserRecord = {
  id: string;
  email: string;
  name: string;
  reservationLimit: number;
  accessHostLimit: number;
  createdAt: string;
  updatedAt: string;
};

type AccessHostKind = "default" | "custom";

type RequestIpStatsRecord = {
  ipAddress: string;
  requestCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
};

type RequestStatsRecord = {
  requestCount: number;
  firstRequestAt: string;
  lastRequestAt: string;
  ipAddresses: Record<string, RequestIpStatsRecord>;
};

type PersistedState = {
  users: Record<string, UserRecord>;
  devices: Record<
    string,
    {
      id: string;
      userId: string;
      name: string;
      hostname: string;
      platform: string;
      fingerprint: string;
      createdAt: string;
      updatedAt: string;
      lastSeenAt: string;
    }
  >;
  reservations: Record<
    string,
    {
      id: string;
      userId: string;
      subdomain: string;
      directRequestStats?: RequestStatsRecord;
      createdAt: string;
      updatedAt: string;
      lastUsedAt: string;
    }
  >;
  accessHosts: Record<
    string,
    {
      id: string;
      userId: string;
      reservationId: string;
      hostname: string;
      kind: AccessHostKind;
      requestStats?: RequestStatsRecord;
      createdAt: string;
      updatedAt: string;
      lastSeenAt: string;
    }
  >;
  deviceTunnels: Record<
    string,
    {
      id: string;
      userId: string;
      deviceId: string;
      localPort: number;
      reservationId: string;
      subdomain: string;
      claimedAt: string;
      updatedAt: string;
    }
  >;
  pendingCliAuth: Record<string, unknown>;
  deviceConnections: Record<string, { deviceId: string; connectedAt: string }>;
};

export type DashboardOverview = {
  user: {
    id: string;
    email: string;
    name: string;
    reservationLimit: number;
    accessHostLimit: number;
    reservedNamespaceCount: number;
    accessHostCount: number;
    remainingNamespaceSlots: number;
    remainingAccessHostSlots: number;
  };
  namespaces: Array<{
    reservationId: string;
    subdomain: string;
    publicUrl: string;
    lastUsedAt: string;
    status: "active" | "blocked" | "offline" | "available";
    directRequestStats: {
      requestCount: number;
      uniqueIpCount: number;
      firstRequestAt?: string;
      lastRequestAt?: string;
      ipAddresses: Array<{
        ipAddress: string;
        requestCount: number;
        firstSeenAt: string;
        lastSeenAt: string;
      }>;
    };
    accessHosts: Array<{
      accessHostId: string;
      label: string;
      hostname: string;
      publicUrl: string;
      kind: AccessHostKind;
      requestStats: {
        requestCount: number;
        uniqueIpCount: number;
        firstRequestAt?: string;
        lastRequestAt?: string;
        ipAddresses: Array<{
          ipAddress: string;
          requestCount: number;
          firstSeenAt: string;
          lastSeenAt: string;
        }>;
      };
      createdAt: string;
      updatedAt: string;
      lastSeenAt: string;
    }>;
    claims: Array<{
      tunnelId: string;
      deviceId: string;
      deviceName: string;
      hostname: string;
      platform: string;
      localPort: number;
      status: "active" | "blocked" | "offline";
      claimedAt: string;
      updatedAt: string;
      lastSeenAt: string;
    }>;
  }>;
};

type UserRow = {
  id: string;
  email: string;
  name: string;
  reservation_limit: number;
  access_host_limit: number;
  created_at: string;
  updated_at: string;
};

type CredentialRow = UserRow & {
  password_hash: string;
  password_salt: string;
};

type TunnelStatus = DashboardOverview["namespaces"][number]["claims"][number]["status"];
type NamespaceStatus = DashboardOverview["namespaces"][number]["status"];

declare global {
  var __boreWebSqlite: DatabaseSync | undefined;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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

function getDatabase(): DatabaseSync {
  if (globalThis.__boreWebSqlite) {
    return globalThis.__boreWebSqlite;
  }

  const dbPath = process.env.BORE_DB_PATH ?? defaultDbPath;
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  ensureSchema(db);
  globalThis.__boreWebSqlite = db;
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

function readSnapshot(): PersistedState {
  const db = getDatabase();
  const userRows = db
    .prepare(
      `SELECT id, email, name, reservation_limit, access_host_limit, created_at, updated_at FROM users`,
    )
    .all() as UserRow[];
  const users = Object.fromEntries(userRows.map((row) => [row.id, mapUser(row)]));
  const appStateRow = db
    .prepare(`SELECT value FROM app_state WHERE key = ?`)
    .get("primary") as { value: string } | undefined;
  const parsed = appStateRow ? (JSON.parse(appStateRow.value) as Partial<PersistedState>) : {};

  return {
    users,
    devices: parsed.devices ?? {},
    reservations: parsed.reservations ?? {},
    accessHosts: parsed.accessHosts ?? {},
    deviceTunnels: parsed.deviceTunnels ?? {},
    pendingCliAuth: parsed.pendingCliAuth ?? {},
    deviceConnections: parsed.deviceConnections ?? {},
  };
}

function cleanupExpiredSessions(db: DatabaseSync): void {
  db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`).run(
    new Date().toISOString(),
  );
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

function getTunnelStatus(
  state: PersistedState,
  tunnel: PersistedState["deviceTunnels"][string],
): TunnelStatus {
  if (!state.deviceConnections[tunnel.deviceId]) {
    return "offline";
  }

  const onlineClaims = Object.values(state.deviceTunnels)
    .filter(
      (candidate) =>
        candidate.userId === tunnel.userId &&
        candidate.subdomain === tunnel.subdomain &&
        Boolean(state.deviceConnections[candidate.deviceId]),
    )
    .sort(
      (left, right) =>
        right.claimedAt.localeCompare(left.claimedAt) ||
        right.updatedAt.localeCompare(left.updatedAt),
    );

  const winner = onlineClaims[0];

  if (!winner) {
    return "offline";
  }

  return winner.id === tunnel.id ? "active" : "blocked";
}

function buildRequestStatsView(
  stats?: RequestStatsRecord,
): DashboardOverview["namespaces"][number]["directRequestStats"] {
  if (!stats) {
    return {
      requestCount: 0,
      uniqueIpCount: 0,
      ipAddresses: [],
    };
  }

  const ipAddresses = Object.values(stats.ipAddresses)
    .sort(
      (left, right) =>
        right.requestCount - left.requestCount ||
        left.ipAddress.localeCompare(right.ipAddress),
    )
    .map((entry) => ({
      ipAddress: entry.ipAddress,
      requestCount: entry.requestCount,
      firstSeenAt: entry.firstSeenAt,
      lastSeenAt: entry.lastSeenAt,
    }));

  return {
    requestCount: stats.requestCount,
    uniqueIpCount: ipAddresses.length,
    firstRequestAt: stats.firstRequestAt,
    lastRequestAt: stats.lastRequestAt,
    ipAddresses,
  };
}

export function createUserAccount(input: {
  email: string;
  password: string;
  name?: string;
}): UserRecord {
  const db = getDatabase();
  const email = normalizeEmail(input.email);

  if (input.password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

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

  db.prepare(`
    INSERT INTO users (id, email, name, reservation_limit, access_host_limit, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    user.id,
    user.email,
    user.name,
    user.reservationLimit,
    user.accessHostLimit,
    user.createdAt,
    user.updatedAt,
  );
  db.prepare(`
    INSERT INTO user_credentials (user_id, password_hash, password_salt, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(user.id, password.hash, password.salt, now);

  return user;
}

export function authenticateUser(
  emailInput: string,
  password: string,
): UserRecord | null {
  const db = getDatabase();
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
    .get(normalizeEmail(emailInput)) as CredentialRow | undefined;

  if (!row || !verifyPassword(password, row.password_salt, row.password_hash)) {
    return null;
  }

  return mapUser(row);
}

export function createSession(userId: string): string {
  const db = getDatabase();
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

export function deleteSession(sessionId: string): void {
  const db = getDatabase();
  db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
}

export function getUserBySessionToken(token: string): UserRecord | null {
  const db = getDatabase();
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
    .get(token, new Date().toISOString()) as UserRow | undefined;

  return row ? mapUser(row) : null;
}

export function getDashboardOverview(
  userId: string,
  publicDomain: string,
): DashboardOverview {
  const state = readSnapshot();
  const user = state.users[userId];

  if (!user) {
    throw new Error(`Unknown user ${userId}`);
  }

  const namespaces = Object.values(state.reservations)
    .filter((reservation) => reservation.userId === user.id)
    .sort((left, right) => left.subdomain.localeCompare(right.subdomain))
    .map((reservation) => {
      const accessHosts = Object.values(state.accessHosts)
        .filter((accessHost) => accessHost.reservationId === reservation.id)
        .map((accessHost) => {
          const suffix = `.${reservation.subdomain}`;
          const label = accessHost.hostname.endsWith(suffix)
            ? accessHost.hostname.slice(0, -suffix.length)
            : accessHost.hostname;

          return {
            accessHostId: accessHost.id,
            label,
            hostname: accessHost.hostname,
            publicUrl: `https://${accessHost.hostname}.${publicDomain}`,
            kind: accessHost.kind ?? "custom",
            requestStats: buildRequestStatsView(accessHost.requestStats),
            createdAt: accessHost.createdAt,
            updatedAt: accessHost.updatedAt,
            lastSeenAt: accessHost.lastSeenAt,
          };
        })
        .sort(
          (left, right) =>
            left.label.localeCompare(right.label) || left.hostname.localeCompare(right.hostname),
        );
      const claims = Object.values(state.deviceTunnels)
        .filter((tunnel) => tunnel.reservationId === reservation.id)
        .map((tunnel) => {
          const device = state.devices[tunnel.deviceId];

          if (!device) {
            return undefined;
          }

          return {
            tunnelId: tunnel.id,
            deviceId: tunnel.deviceId,
            deviceName: device.name,
            hostname: device.hostname,
            platform: device.platform,
            localPort: tunnel.localPort,
            status: getTunnelStatus(state, tunnel),
            claimedAt: tunnel.claimedAt,
            updatedAt: tunnel.updatedAt,
            lastSeenAt: device.lastSeenAt,
          };
        })
        .filter((claim): claim is NonNullable<typeof claim> => claim !== undefined)
        .sort(
          (left, right) =>
            right.claimedAt.localeCompare(left.claimedAt) ||
            right.updatedAt.localeCompare(left.updatedAt),
        );

      const status: NamespaceStatus =
        claims.find((claim) => claim.status === "active")?.status ??
        claims.find((claim) => claim.status === "blocked")?.status ??
        claims.find((claim) => claim.status === "offline")?.status ??
        "available";

      return {
        reservationId: reservation.id,
        subdomain: reservation.subdomain,
        publicUrl: `https://${reservation.subdomain}.${publicDomain}`,
        lastUsedAt: reservation.lastUsedAt,
        status,
        directRequestStats: buildRequestStatsView(reservation.directRequestStats),
        accessHosts,
        claims,
      };
    });

  const accessHostCount = Object.values(state.accessHosts).filter(
    (accessHost) => accessHost.userId === user.id && (accessHost.kind ?? "custom") === "custom",
  ).length;

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      reservationLimit: user.reservationLimit,
      accessHostLimit: user.accessHostLimit ?? DEFAULT_ACCESS_HOST_LIMIT,
      reservedNamespaceCount: namespaces.length,
      accessHostCount,
      remainingNamespaceSlots: Math.max(
        user.reservationLimit - namespaces.length,
        0,
      ),
      remainingAccessHostSlots: Math.max(
        (user.accessHostLimit ?? DEFAULT_ACCESS_HOST_LIMIT) - accessHostCount,
        0,
      ),
    },
    namespaces,
  };
}
